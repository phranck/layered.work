import type { SyntaxNode, Tree } from "@lezer/common";
import { parseContent } from "../parser/index.js";
import { NODE } from "../parser/nodes.js";
import { argumentsOf, childOf, childrenOf, unquote, writtenKindOf, writtenValueOf } from "../parser/read.js";
import type { ComponentDefinition, Parameter, Register } from "../register/kinds.js";
import { defaultsOf, resolveComponent, unnamedParameter } from "../register/lookup.js";
import { type CodeNode, type ComponentNode, element, type RenderNode, text } from "./model.js";
import { type Content, ENTITIES, MARKS, PROSE } from "./prose.js";

/**
 * Turning a parse tree into the model of a finished page.
 *
 * Everything about what a document means is decided here: which component,
 * which props, which prose, in which order. Whoever draws it only has to draw
 * it, which is what lets the website draw it as React components and the
 * dashboard's preview draw it as something else without the two disagreeing.
 *
 * **The register is read here and nowhere afterwards.** A component node
 * carries the name of what draws it and every prop with the register's defaults
 * already filled in, so a renderer holds no opinion about what a parameter
 * means.
 *
 * **Nothing is thrown away.** A construct the prose table does not name keeps
 * its content and loses only its wrapper, and a component that is not one
 * becomes a placeholder. Rendering less than somebody wrote, silently, is the
 * one outcome worth designing against.
 */

/** What the renderer needs besides the document. */
export type RenderOptions = {
  /** Which register to read. The real one unless a test says otherwise. */
  register?: Register;
};

/** The document, the register, and the link targets it defines. */
type Context = {
  text: string;
  register?: Register;
  /** Where each reference link points, by its label in lower case. */
  references: Map<string, string>;
};

/**
 * The component whose children sit side by side.
 *
 * Named here rather than marked in the register, because the rule below is
 * about this one component and a register property nothing else would read is
 * a generality bought before anybody asked for it.
 */
const SIDE_BY_SIDE = "HStack";

/** What a run of prose becomes inside that one. */
const COLUMN = "VStack";

/**
 * Renders a document.
 *
 * @param text - The document as written.
 * @param options - What is known besides the text.
 * @returns The page, as nodes.
 */
export function renderContent(text: string, options: RenderOptions = {}): RenderNode[] {
  return renderTree(parseContent(text), text, options);
}

/**
 * Renders a document that has already been parsed.
 *
 * @param tree - The tree, whose positions are positions in `text`.
 * @param text - The document the tree was parsed from.
 * @param options - What is known besides the text.
 * @returns The page, as nodes.
 */
export function renderTree(tree: Tree, text: string, options: RenderOptions = {}): RenderNode[] {
  const context: Context = {
    text,
    register: options.register,
    references: linkTargets(tree, text),
  };

  return blockChildren(tree.topNode, context);
}

/**
 * Every reference link the document defines.
 *
 * Collected before anything is rendered, because a document may use one above
 * the line that defines it, which is most of the reason for writing links that
 * way at all.
 *
 * @param tree - The whole tree.
 * @param text - The document.
 * @returns Each label, in lower case, and where it points.
 */
function linkTargets(tree: Tree, text: string): Map<string, string> {
  const targets = new Map<string, string>();

  tree.iterate({
    enter(node) {
      if (node.name !== "LinkReference") return true;

      const label = childOf(node.node, "LinkLabel");
      const url = childOf(node.node, "URL");
      if (label && url) {
        targets.set(text.slice(label.from + 1, label.to - 1).toLowerCase(), text.slice(url.from, url.to));
      }
      return false;
    },
  });

  return targets;
}

/** What a node covers in the document. */
function source(node: SyntaxNode, context: Context): string {
  return context.text.slice(node.from, node.to);
}

/**
 * The children of a block, with the whitespace between them dropped.
 *
 * A blank line between two paragraphs is what separates them rather than
 * something either of them contains, so it never becomes a node.
 */
function blockChildren(node: SyntaxNode, context: Context): RenderNode[] {
  return childrenOf(node).flatMap((child) => renderNode(child, context));
}

/**
 * The children of a span, with the gaps between them kept.
 *
 * Inside a paragraph the gaps are the words. A node covers what it marks up and
 * nothing else, so everything the children do not cover is text.
 *
 * @param node - Whose children to walk.
 * @param from - Where the span starts.
 * @param to - Where it ends.
 * @param context - The document and the register.
 */
function inlineChildren(node: SyntaxNode, from: number, to: number, context: Context): RenderNode[] {
  const nodes: RenderNode[] = [];
  let at = from;

  for (const child of childrenOf(node)) {
    if (child.to <= from || child.from >= to) continue;
    if (child.from > at) nodes.push(text(context.text.slice(at, child.from)));
    nodes.push(...renderNode(child, context));
    at = child.to;
  }

  if (to > at) nodes.push(text(context.text.slice(at, to)));
  return nodes.filter((node) => node.kind !== "text" || node.value !== "");
}

/**
 * One node, which may produce nothing, one thing, or several.
 *
 * @param node - The node to render.
 * @param context - The document and the register.
 */
function renderNode(node: SyntaxNode, context: Context): RenderNode[] {
  const name = node.name;

  // Syntax, and a definition that says where a link points. Neither is content.
  if (MARKS.has(name) || name === "LinkReference") return [];

  if (name === NODE.Component) return [componentNode(node, context)];
  if (name === NODE.ComponentError) return [placeholderNode(node, context)];

  if (name === "FencedCode" || name === "CodeBlock") return [codeNode(node, context)];
  if (name === "Link") return linkNodes(node, context);
  if (name === "Image") return [imageNode(node, context)];
  if (name === "ListItem") return [listItemNode(node, context)];
  if (name === "Table") return [tableNode(node, context)];
  if (name === "URL") return [autolinkNode(node, context)];

  // HTML written in a document is what somebody typed, and it reaches the page
  // as that. This is the whole of the injection defence: there is no node that
  // could carry it as markup instead.
  if (name === "HTMLBlock" || name === "HTMLTag") return [text(source(node, context))];

  if (name === "Escape") return [text(source(node, context).slice(1))];
  if (name === "Entity") return [text(decodeEntity(source(node, context)))];

  const prose = PROSE[name];
  if (prose) return [element(prose.tag, contentOf(node, prose.content, context))];

  // Not in the table. Keep everything it covers, lose only the wrapper, which
  // for a leaf is the text itself and for a container is its children.
  return inlineChildren(node, node.from, node.to, context);
}

/** The children of a node, gathered the way its kind of content is gathered. */
function contentOf(node: SyntaxNode, content: Content, context: Context): RenderNode[] {
  switch (content) {
    case "empty":
      return [];
    case "block":
      return blockChildren(node, context);
    case "inline":
      return inlineChildren(node, node.from, node.to, context);
    case "heading":
      return trimEnds(inlineChildren(node, node.from, node.to, context));
  }
}

/**
 * The same nodes without the whitespace at either end.
 *
 * A heading is written `## Titel` and a Setext one underlined, so its content
 * begins after a space in one case and ends with a line break in the other.
 * Neither is part of what the heading says.
 */
function trimEnds(nodes: RenderNode[]): RenderNode[] {
  const trimmed = [...nodes];

  const first = trimmed[0];
  if (first?.kind === "text") trimmed[0] = text(first.value.trimStart());

  const last = trimmed[trimmed.length - 1];
  if (last?.kind === "text") trimmed[trimmed.length - 1] = text(last.value.trimEnd());

  return trimmed.filter((node) => node.kind !== "text" || node.value !== "");
}

/**
 * One of the language's components.
 *
 * @param node - A component node.
 * @param context - The document and the register.
 * @returns The component, or a placeholder when the register knows no such
 *   name.
 */
function componentNode(node: SyntaxNode, context: Context): RenderNode {
  const nameNode = childOf(node, NODE.ComponentName);
  const written = nameNode ? source(nameNode, context) : "";
  const resolution = resolveComponent(written, context.register);

  if (!resolution.found) return { kind: "placeholder", name: written };

  const body = childOf(node, NODE.ComponentBody);
  const children = body ? blockChildren(body, context) : [];

  return {
    kind: "component",
    name: resolution.name,
    renders: resolution.definition.renders,
    props: propsOf(node, resolution.definition, context),
    children: resolution.name === SIDE_BY_SIDE ? asColumns(children, context) : children,
  };
}

/** A component the parser could not read to its end. */
function placeholderNode(node: SyntaxNode, context: Context): RenderNode {
  const nameNode = childOf(node, NODE.ComponentName);
  return { kind: "placeholder", name: nameNode ? source(nameNode, context) : "" };
}

/**
 * Every parameter of a component, with the register's defaults filled in.
 *
 * A parameter the register does not have is left out rather than passed on,
 * because there is nothing to pass it as. The validator is what says so to the
 * person who wrote it; rendering a draft carries on regardless, since a preview
 * that stopped at the first mistake would be no use for finding the second.
 *
 * @param node - A component node.
 * @param definition - What the register says it is.
 * @param context - The document and the register.
 */
function propsOf(
  node: SyntaxNode,
  definition: ComponentDefinition,
  context: Context,
): Record<string, string | number | boolean> {
  const props: Record<string, string | number | boolean> = { ...defaultsOf(definition) };
  let unnamedTaken = false;

  for (const argument of argumentsOf(node)) {
    const valueNode = writtenValueOf(argument);
    if (!valueNode) continue;

    const nameChild = childOf(argument, NODE.ArgumentName);
    const bound = nameChild
      ? namedParameter(source(nameChild, context), definition)
      : unnamedTaken
        ? undefined
        : unnamedParameter(definition);

    if (!bound) continue;
    if (!nameChild) unnamedTaken = true;

    props[bound.name] = propValue(bound.parameter, valueNode, context);
  }

  return props;
}

/** A parameter by the name it was written under, where the register has one. */
function namedParameter(
  written: string,
  definition: ComponentDefinition,
): { name: string; parameter: Parameter } | undefined {
  const parameter = definition.parameters[written];
  return parameter ? { name: written, parameter } : undefined;
}

/**
 * What a written value is, as the thing a renderer receives.
 *
 * Converted by the form it was written in rather than by the kind the register
 * declares, so a value written in the wrong form reaches the page as what
 * somebody typed instead of being chopped into nonsense by a conversion that
 * assumed otherwise.
 *
 * @param parameter - What the register says this parameter takes.
 * @param valueNode - The value as written.
 * @param context - The document.
 */
function propValue(parameter: Parameter, valueNode: SyntaxNode, context: Context): string | number | boolean {
  const raw = source(valueNode, context);

  // A step names a position on a scale rather than counting anything, and
  // `var(--space-6)` wants the 6 as a name. It stays as it was written.
  if (parameter.kind === "step") return raw;

  switch (writtenKindOf(valueNode)) {
    case "string":
      return unquote(raw);
    case "number":
      return Number(raw);
    case "keyword":
      return raw === "true" ? true : raw === "false" ? false : raw;
    default:
      return raw;
  }
}

/**
 * A run of prose inside a horizontal stack becomes one column.
 *
 * A picture beside two paragraphs is two columns, not three. Without this an
 * author would have to wrap the prose in a `VStack` by hand every time, and the
 * one who forgot would get a layout nobody meant.
 *
 * @param children - What the stack holds.
 * @param context - The document and the register.
 */
function asColumns(children: RenderNode[], context: Context): RenderNode[] {
  const column = resolveComponent(COLUMN, context.register);
  if (!column.found) return children;

  const columns: RenderNode[] = [];
  let run: RenderNode[] = [];

  const close = () => {
    if (run.length === 0) return;
    columns.push({
      kind: "component",
      name: column.name,
      renders: column.definition.renders,
      props: defaultsOf(column.definition),
      children: run,
    } satisfies ComponentNode);
    run = [];
  };

  for (const child of children) {
    // A placeholder stands where a component stood, so it breaks a run exactly
    // as the component it was written as would have.
    if (child.kind === "component" || child.kind === "placeholder") {
      close();
      columns.push(child);
      continue;
    }
    run.push(child);
  }

  close();
  return columns;
}

/** A fenced or indented block of code. */
function codeNode(node: SyntaxNode, context: Context): CodeNode {
  const info = childOf(node, "CodeInfo");
  const body = childOf(node, "CodeText");
  const language = info ? source(info, context) : "";

  return {
    kind: "code",
    ...(language ? { language } : {}),
    source: body ? source(body, context) : "",
  };
}

/**
 * A link, as an anchor when anything says where it goes.
 *
 * A reference whose definition is missing is not an anchor at all: a link to
 * nowhere is worse than the words on their own, because it looks like it works.
 */
function linkNodes(node: SyntaxNode, context: Context): RenderNode[] {
  const label = labelOf(node, context);
  const href = hrefOf(node, context);
  return href ? [element("a", label, { href })] : label;
}

/** The words between a link's first two marks, which is what it says. */
function labelOf(node: SyntaxNode, context: Context): RenderNode[] {
  const marks = childrenOf(node).filter((child) => child.name === "LinkMark");
  const from = marks[0]?.to ?? node.from;
  const to = marks[1]?.from ?? node.to;
  return inlineChildren(node, from, to, context);
}

/** Where a link goes, whether it says so itself or names a definition. */
function hrefOf(node: SyntaxNode, context: Context): string | undefined {
  const url = childOf(node, "URL");
  if (url) return source(url, context);

  const label = childOf(node, "LinkLabel");
  const marks = childrenOf(node).filter((child) => child.name === "LinkMark");

  // `[a][b]` names its definition in a label of its own; `[a]` is its own name.
  const key = label
    ? context.text.slice(label.from + 1, label.to - 1)
    : context.text.slice(marks[0]?.to ?? node.from, marks[1]?.from ?? node.to);

  return context.references.get(key.toLowerCase());
}

/** A bare address somebody wrote in the middle of a sentence. */
function autolinkNode(node: SyntaxNode, context: Context): RenderNode {
  const address = source(node, context);
  return element("a", [text(address)], { href: address });
}

/** A picture written as Markdown, which is not the media library's kind. */
function imageNode(node: SyntaxNode, context: Context): RenderNode {
  const url = childOf(node, "URL");
  const marks = childrenOf(node).filter((child) => child.name === "LinkMark");
  const alt = context.text.slice(marks[0]?.to ?? node.from, marks[1]?.from ?? node.to);

  return element("img", [], { src: url ? source(url, context) : "", alt });
}

/** An item of a list, which may be something to tick off. */
function listItemNode(node: SyntaxNode, context: Context): RenderNode {
  const task = childOf(node, "Task");
  if (!task) return element("li", blockChildren(node, context));

  const marker = childOf(task, "TaskMarker");
  const done = marker ? /[xX]/.test(source(marker, context)) : false;
  const from = marker ? marker.to : task.from;

  return element("li", trimEnds(inlineChildren(task, from, task.to, context)), {
    "data-task": done ? "done" : "open",
  });
}

/**
 * A table, with its head and its body told apart.
 *
 * The alignment written in the delimiter row is not carried across. Nothing
 * asks for it yet, and a column that is right-aligned in the source and not on
 * the page is a smaller surprise than a feature nobody uses.
 */
function tableNode(node: SyntaxNode, context: Context): RenderNode {
  const rows = childrenOf(node);
  const header = rows.find((row) => row.name === "TableHeader");
  const body = rows.filter((row) => row.name === "TableRow");
  const parts: RenderNode[] = [];

  if (header) parts.push(element("thead", [element("tr", cellsOf(header, "th", context))]));
  if (body.length > 0) {
    parts.push(
      element(
        "tbody",
        body.map((row) => element("tr", cellsOf(row, "td", context))),
      ),
    );
  }

  return element("table", parts);
}

/** The cells of one row. */
function cellsOf(row: SyntaxNode, tag: string, context: Context): RenderNode[] {
  return childrenOf(row)
    .filter((cell) => cell.name === "TableCell")
    .map((cell) => element(tag, inlineChildren(cell, cell.from, cell.to, context)));
}

/** The highest code point a character can have. */
const LAST_CODE_POINT = 0x10ffff;

/**
 * What an entity stands for.
 *
 * Numbers are decoded in full, because the rule is arithmetic rather than a
 * list. Names are decoded from the short list in `prose.ts`, and anything else
 * reaches the page as it was written.
 */
function decodeEntity(raw: string): string {
  const body = raw.slice(1, -1);

  if (body.startsWith("#")) {
    const hexadecimal = body[1] === "x" || body[1] === "X";
    const code = Number.parseInt(body.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    return Number.isInteger(code) && code >= 0 && code <= LAST_CODE_POINT ? String.fromCodePoint(code) : raw;
  }

  return ENTITIES[body] ?? raw;
}
