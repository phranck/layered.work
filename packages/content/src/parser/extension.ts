import type { Tree } from "@lezer/common";
import type {
  BlockContext,
  Element,
  InlineContext,
  Line,
  MarkdownConfig,
  MarkdownParser,
} from "@lezer/markdown";
import { dedent } from "./dedent.js";
import { NODE, VALUE_NODE } from "./nodes.js";
import { OPEN_ERRORS, type ScannedComponent, scanComponent, startsComponent } from "./scan.js";
import { readValueReference } from "./value.js";

/**
 * The block parser, which is the thin part.
 *
 * Everything about where a component begins and ends is in `scan.ts`, over the
 * raw text, with no parser around it. This places nodes and nothing else, which
 * is what keeps the awkward counting out of the part that has to know about
 * Lezer.
 *
 * **The body is parsed by the same parser, recursively.** That is what makes a
 * body Markdown again, and it is also what makes a component inside a component
 * work with no further code: the inner one is found by the same block parser on
 * the inner pass.
 *
 * **Positions are the document's throughout.** A body is dedented before
 * Markdown reads it, which moves everything after the first line, so every
 * position in the inner tree is mapped back as it is copied out. A validator
 * that pointed at a line and a column in a text nobody wrote would be worse
 * than one that pointed at nothing.
 */

/** How many lines a component may span before the parser gives up on it. */
const LINE_LIMIT = 2000;

/**
 * Reads the lines of one component out of the context.
 *
 * Lezer hands a block parser one line at a time, and a component may run over
 * many. This takes them until the scanner says the thing is closed, which reuses
 * the counting rather than repeating a smaller version of it here.
 *
 * @param cx - The parse in progress.
 * @param line - The line it is on.
 * @returns What was scanned, with positions relative to the component's start,
 *   and how many characters of the document it covered.
 */
function takeComponent(cx: BlockContext, line: Line): { found: ScannedComponent; start: number } | null {
  const start = cx.lineStart + line.pos;
  let buffer = line.text.slice(line.pos);

  for (let taken = 0; taken < LINE_LIMIT; taken += 1) {
    const found = scanComponent(buffer, 0);
    if (!found) return null;

    // Closed, or closed with text beside it, which another line cannot mend. An
    // error about a bracket or a brace still open means the component is not
    // finished until another line has been added to it.
    if (!found.error || !OPEN_ERRORS.has(found.error.code)) return { found, start };

    // The line after the current one, read without moving, which is the only
    // public way to see text the context has not reached yet. At the end of the
    // document `nextLine` says so and what was scanned is what there is.
    const next = cx.peekLine();
    if (!cx.nextLine()) return { found, start };

    buffer += `\n${next}`;
  }

  return null;
}

/** Builds the elements for one argument list. */
function argumentElements(cx: BlockContext, found: ScannedComponent, start: number): Element[] {
  const list = found.arguments;
  if (!list) return [];

  const items = list.items.map((item) => {
    const parts: Element[] = [];
    if (item.name) {
      parts.push(cx.elt(NODE.ArgumentName, start + item.name.from, start + item.name.to));
    }
    parts.push(cx.elt(VALUE_NODE[item.value.kind], start + item.value.from, start + item.value.to));
    return cx.elt(
      NODE.ComponentArgument,
      parts[0]?.from ?? start + list.from,
      parts[parts.length - 1]?.to ?? start + list.to,
      parts,
    );
  });

  return [cx.elt(NODE.ComponentArguments, start + list.from, start + list.to, items)];
}

/**
 * Copies a tree parsed from the dedented body into elements at document
 * positions.
 *
 * @param cx - The parse in progress, which is what makes an element.
 * @param tree - The tree of the body, parsed on its own.
 * @param toDocument - The mapping back from the shortened text.
 */
function copyBody(cx: BlockContext, tree: Tree, toDocument: (at: number) => number): Element[] {
  const children: Element[] = [];
  const cursor = tree.cursor();

  // Only the top level. Everything below is copied by the recursion, and a
  // flat walk would lose the nesting that makes the tree worth having.
  if (!cursor.firstChild()) return children;
  do {
    children.push(copyNode(cx, cursor.node, toDocument));
  } while (cursor.nextSibling());

  return children;
}

/** One node and everything under it, at document positions. */
function copyNode(
  cx: BlockContext,
  node: ReturnType<Tree["cursor"]>["node"],
  toDocument: (at: number) => number,
): Element {
  const children: Element[] = [];
  const cursor = node.cursor();

  if (cursor.firstChild()) {
    do {
      children.push(copyNode(cx, cursor.node, toDocument));
    } while (cursor.nextSibling());
  }

  return cx.elt(node.type.name, toDocument(node.from), toDocument(node.to), children);
}

/** The character codes the escape below looks at, as an inline parser is handed them. */
const BACKSLASH = 92;
const OPEN_BRACE = 123;
const NEWLINE = 10;
const SPACE = 32;
const TAB = 9;

/**
 * Whether nothing but indentation stands before this position on its line.
 *
 * Read within the inline section alone, because that is all an inline parser
 * can see. The section begins where a paragraph's text begins, which is after a
 * list marker or a quote marker, and that is exactly where the block parser
 * would have looked for a component.
 *
 * @param cx - The inline parse in progress.
 * @param at - The position to ask about, in the document.
 */
function startsLine(cx: InlineContext, at: number): boolean {
  for (let before = at - 1; before >= cx.offset; before -= 1) {
    const code = cx.char(before);
    if (code === NEWLINE) return true;
    if (code !== SPACE && code !== TAB) return false;
  }
  return true;
}

/**
 * The extension, as Lezer takes it.
 *
 * Placed before Markdown's own fenced code parser would be wrong: a component
 * line inside a fence is an example rather than a component, and letting the
 * fence win is the rule the epic states. The default position, at the end of
 * the list, is therefore the right one, and this comment is here because the
 * temptation to move it forward is real.
 */
export const componentSyntax: MarkdownConfig = {
  // Only the three that hold other things are blocks. The rest sit inside a
  // component and are marked as what they are so highlighting can reach them.
  defineNodes: Object.values(NODE).map((name) => ({
    name,
    block: name === NODE.Component || name === NODE.ComponentBody || name === NODE.ComponentError,
  })),

  parseBlock: [
    {
      name: "LayeredComponent",

      parse(cx: BlockContext, line: Line) {
        const at = cx.lineStart + line.pos;
        if (!startsComponent(line.text, line.pos)) return false;

        const taken = takeComponent(cx, line);
        if (!taken) return false;

        const { found, start } = taken;
        const children: Element[] = [
          cx.elt(NODE.ComponentName, start + found.name.from, start + found.name.to),
          ...argumentElements(cx, found, start),
        ];

        if (found.body) {
          const shortened = dedent(found.body.text, start + found.body.from);
          const inner = (cx.parser as MarkdownParser).parse(shortened.text);
          children.push(
            cx.elt(
              NODE.ComponentBody,
              start + found.body.from,
              start + found.body.to,
              copyBody(cx, inner, shortened.toDocument),
            ),
          );
        }

        const to = start + found.to;
        const element = found.error
          ? cx.elt(NODE.ComponentError, at, to, children)
          : cx.elt(NODE.Component, at, to, children);

        cx.addElement(element);
        cx.nextLine();
        return true;
      },
    },
  ],

  // The escape is the language's own, so the language takes the backslash off.
  // A block parser cannot do it: it either takes a whole line or none of it, and
  // the rest of this line belongs to a paragraph that may run on. Markdown's own
  // escape would not take it either, because it only escapes punctuation and a
  // component's name starts with a letter, so this runs ahead of that one.
  parseInline: [
    {
      name: "ComponentEscape",
      before: "Escape",

      parse(cx: InlineContext, next: number, at: number) {
        if (next !== BACKSLASH || !startsLine(cx, at)) return -1;
        if (!startsComponent(cx.slice(at + 1, cx.end), 0)) return -1;
        return cx.addElement(cx.elt(NODE.ComponentEscape, at, at + 1));
      },
    },
    // A reference to a named value is its own node, so everything that walks the
    // tree finds it, and Markdown's code spans keep it as text because an inline
    // parser never runs inside one.
    {
      name: "ValueReference",

      parse(cx: InlineContext, next: number, at: number) {
        if (next !== OPEN_BRACE || cx.char(at + 1) !== OPEN_BRACE) return -1;
        const reference = readValueReference(cx.slice(at, cx.end));
        if (!reference) return -1;
        const nameFrom = at + reference.nameFrom;
        return cx.addElement(
          cx.elt(NODE.ValueReference, at, at + reference.length, [
            cx.elt(NODE.ValueName, nameFrom, nameFrom + reference.name.length),
          ]),
        );
      },
    },
  ],
};
