/**
 * What a document turns into once everything about its meaning is decided.
 *
 * **Text is text, never markup.** There is no node that carries a string of
 * HTML, so there is nowhere for an injection to sit: HTML written in a document
 * arrives here as the characters somebody typed. Whoever draws the page escapes
 * once, at the point text becomes markup, and a renderer that received
 * pre-escaped text would escape it twice.
 *
 * **A component names what draws it and carries its props.** The register is
 * read here and nowhere afterwards, so a renderer is a table from a name to a
 * component and holds no opinion about what a parameter means or defaults to.
 *
 * **Elements are HTML.** Prose has tags and attributes because prose is prose,
 * and inventing a second vocabulary for a paragraph would help nobody.
 */

/** Anything that can appear in a rendered document. */
export type RenderNode = ComponentNode | ElementNode | CodeNode | TextNode | PlaceholderNode;

/** One of the language's components, ready to be drawn. */
export type ComponentNode = {
  kind: "component";
  /** What it is called in the document, as the register knows it. */
  name: string;
  /** What draws it, by the name the register gives. */
  renders: string;
  /** Every parameter, with the register's defaults filled in. */
  props: Readonly<Record<string, string | number | boolean>>;
  children: RenderNode[];
};

/** A piece of prose, as the tag it is written with. */
export type ElementNode = {
  kind: "element";
  tag: string;
  attributes: Readonly<Record<string, string>>;
  children: RenderNode[];
};

/**
 * A block of code.
 *
 * Its own node rather than a `pre` holding a `code`, because its content is a
 * string rather than nodes and because the language decides how it is
 * highlighted.
 */
export type CodeNode = {
  kind: "code";
  /** What was written after the fence, where anything was.  */
  language?: string;
  /** The source, exactly as written. */
  source: string;
};

/** Words. */
export type TextNode = { kind: "text"; value: string };

/**
 * Something that was written as a component and is not one.
 *
 * Visible on purpose. A document with one of these cannot be published, so this
 * is what a draft and a preview show, and showing nothing would hide the
 * problem from the one person who could fix it.
 */
export type PlaceholderNode = {
  kind: "placeholder";
  /** What was written where a component was expected. */
  name: string;
};

/** Words, as a node. */
export function text(value: string): TextNode {
  return { kind: "text", value };
}

/** A tag with something inside it. */
export function element(
  tag: string,
  children: RenderNode[],
  attributes: Record<string, string> = {},
): ElementNode {
  return { kind: "element", tag, attributes, children };
}
