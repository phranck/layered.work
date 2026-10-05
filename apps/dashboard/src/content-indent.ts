import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import {
  bracketMatching,
  ensureSyntaxTree,
  indentOnInput,
  indentRange,
  indentService,
  indentUnit,
  syntaxTree,
} from "@codemirror/language";
import { countColumn, EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { type Command, EditorView, keymap } from "@codemirror/view";
import { bodyIndent, childOf, NODE } from "@layered/content";
import type { SyntaxNode, Tree } from "@lezer/common";
import { INDENT_UNIT } from "./editor-toolbar.js";

/**
 * Indentation and brackets on the writing surface.
 *
 * **The parse tree decides where a line stands.** The tree is the one the server
 * parses, so the indentation of a document is a function of its structure and not
 * of whatever state it was left in: every component line stands at the depth of
 * the bodies around it, and a closing brace stands where the line that opened its
 * component does. That is what lets one command put a whole document right, and
 * lets a second run change nothing.
 *
 * **Markdown inside a body keeps its own indentation**, because a nested list
 * depends on it. Each such line keeps the distance it has from the body's first
 * line, which is the distance the parser keeps when it takes that line's
 * indentation off (`bodyIndent`), so reindenting never changes what Markdown
 * reads. At the top of the document, where nothing is nested, Markdown stays as
 * it is written.
 */

/** One level of indentation, in columns. */
const INDENT_COLUMNS = INDENT_UNIT.length;

/** How long to let the parser work for a tree that spans the document, in milliseconds. */
const TREE_BUDGET_MS = 100;

/** The brackets that close themselves when typed: a component's arguments and its body. */
const SELF_CLOSING_BRACKETS = ["(", "{"];

/** A line that holds nothing but the brace closing a body, which moves as it is typed. */
const BODY_CLOSING_LINE = /^\s*\}$/;

/** The name of the tree's top node, which is Markdown's and not this language's. */
const DOCUMENT = "Document";

/** What a position stands inside: a component's body or its argument list. */
type Container = { kind: "body" | "arguments"; node: SyntaxNode };

/** The parse tree, parsed as far as the document goes. */
function contentTree(state: EditorState): Tree {
  return ensureSyntaxTree(state, state.doc.length, TREE_BUDGET_MS) ?? syntaxTree(state);
}

/**
 * The innermost body or argument list that holds a position.
 *
 * A body holds a position from the brace that opens it to the brace that closes
 * it, both ends included, so the line that closes a body and the empty place
 * between two braces both belong to it. An argument list holds only what is
 * strictly between its brackets. The body is found through its component
 * because a tree search never enters a node with no width, which is what an
 * empty body is.
 *
 * @param tree - The document's parse tree.
 * @param position - Where to look.
 */
function containerAt(tree: Tree, position: number): Container | null {
  for (let node: SyntaxNode | null = tree.resolveInner(position, -1); node; node = node.parent) {
    if (node.name === NODE.ComponentArguments && node.from < position && position < node.to) {
      return { kind: "arguments", node };
    }
    if (node.name === NODE.Component) {
      const body = childOf(node, NODE.ComponentBody);
      if (body && body.from <= position && position <= body.to) return { kind: "body", node: body };
    }
  }
  return null;
}

/** How many bodies a body stands in, itself included. */
function depthOf(body: SyntaxNode): number {
  let depth = 0;
  for (let node: SyntaxNode | null = body; node; node = node.parent) {
    if (node.name === NODE.ComponentBody) depth += 1;
  }
  return depth;
}

/**
 * Whether a component starts at a position as a block of the document or of a
 * body. One inside a list item or a quote is indented by Markdown's own rules.
 *
 * @param tree - The document's parse tree.
 * @param position - The first character of a line that is not whitespace.
 */
function startsBlockComponent(tree: Tree, position: number): boolean {
  let component: SyntaxNode | null = null;
  for (
    let node: SyntaxNode | null = tree.resolveInner(position, 1);
    node && node.from === position;
    node = node.parent
  ) {
    if (node.name === NODE.Component || node.name === NODE.ComponentError) component = node;
  }
  const holder = component?.parent?.name;
  return holder === NODE.ComponentBody || holder === DOCUMENT;
}

/** The indentation of a line as it is written, in columns. */
function writtenIndent(state: EditorState, lineText: string): number {
  return countColumn(/^[ \t]*/.exec(lineText)?.[0] ?? "", state.tabSize);
}

/**
 * The indentation the line holding a position gets, or the one it has where the
 * document leaves it as written.
 */
function indentationOfLineHolding(state: EditorState, position: number): number {
  const line = state.doc.lineAt(position);
  return indentationOf(state, line.from, line.text) ?? writtenIndent(state, line.text);
}

/**
 * The columns a line is indented by, as the tree says it should be.
 *
 * Read from the document as it is, never from the indentation an earlier line was
 * just given, so a whole document derived line by line comes out the same as it
 * does one line at a time.
 *
 * @param state - The editor's state.
 * @param position - Where the line starts, or where a new one starts when Enter is
 *   pressed in the middle of a line.
 * @param text - What stands on the line from `position` on.
 * @returns The indentation in columns, or null where the line is Markdown at the
 *   top of the document, which stays as it is written.
 */
export function indentationOf(state: EditorState, position: number, text: string): number | null {
  const tree = contentTree(state);
  const leading = /^[ \t]*/.exec(text)?.[0] ?? "";
  const first = position + leading.length;
  const container = containerAt(tree, position);

  if (container?.kind === "arguments") {
    // A list that runs over several lines hangs one level below the component
    // that opened it, and its closing bracket stands under that component.
    const ownerIndent = indentationOfLineHolding(state, container.node.parent?.from ?? container.node.from);
    const closes = text[leading.length] === ")" && first === container.node.to - 1;
    return closes ? ownerIndent : ownerIndent + INDENT_COLUMNS;
  }

  if (container?.kind === "body") {
    const body = container.node;
    if (text[leading.length] === "}" && first === body.to) {
      return indentationOfLineHolding(state, body.parent?.from ?? body.from);
    }
    const base = depthOf(body) * INDENT_COLUMNS;
    if (startsBlockComponent(tree, first)) return base;
    const distance = Math.max(0, leading.length - bodyIndent(state.sliceDoc(body.from, body.to)));
    return base + distance;
  }

  return startsBlockComponent(tree, first) ? 0 : null;
}

/**
 * Puts the indentation of every line right, from the document's structure.
 *
 * Two documents that say the same thing come out the same, and a second run
 * changes nothing, because each line is derived from the tree and from its
 * distance to the first line of its body, and never from the indentation an
 * earlier run gave it.
 */
export const reindentDocument: Command = (view) => {
  const changes = indentRange(view.state, 0, view.state.doc.length);
  if (!changes.empty) view.dispatch({ changes, userEvent: "indent" });
  return true;
};

/**
 * Typing the `}` of the body the cursor is in, on a line that holds nothing
 * else, steps past the closing brace that body already has.
 *
 * Typing `{` closes it and Enter between the braces opens a line between them,
 * so by the time the body is written its closing brace is already below the
 * cursor. Without this the typed brace would be a second one. The blank line the
 * cursor was on goes, and the cursor stands after the existing brace.
 */
const stepOverClosingBrace = EditorView.inputHandler.of((view, from, to, text) => {
  if (text !== "}" || from !== to) return false;
  const { state } = view;
  const line = state.doc.lineAt(from);
  if (line.from === 0 || line.text.trim() !== "") return false;

  const container = containerAt(contentTree(state), from);
  if (container?.kind !== "body" || state.sliceDoc(from, container.node.to).trim() !== "") return false;

  const removed = line.to - (line.from - 1);
  view.dispatch({
    changes: { from: line.from - 1, to: line.to },
    selection: EditorSelection.cursor(container.node.to - removed + 1),
    scrollIntoView: true,
    userEvent: "input.type",
  });
  return true;
});

/**
 * Everything the surface does about indentation and brackets.
 *
 * Enter indents to the level the tree gives, and between two braces it opens a
 * line between them. A `}` typed at the start of a line outdents itself. `(` and
 * `{` close themselves, and typing the closing character over one of those steps
 * past it. Matching brackets are highlighted, and an unmatched one beside the
 * cursor is marked.
 *
 * Only the two brackets the language uses close themselves, because the other
 * characters closing would work against prose: an apostrophe is not a quote.
 */
export function contentIndentation(): Extension {
  return [
    indentUnit.of(INDENT_UNIT),
    indentService.of((context, position) => {
      const line = context.lineAt(position, 1);
      return indentationOf(context.state, line.from, line.text);
    }),
    indentOnInput(),
    EditorState.languageData.of(() => [
      { indentOnInput: BODY_CLOSING_LINE, closeBrackets: { brackets: SELF_CLOSING_BRACKETS } },
    ]),
    closeBrackets(),
    stepOverClosingBrace,
    bracketMatching(),
    keymap.of(closeBracketsKeymap),
  ];
}
