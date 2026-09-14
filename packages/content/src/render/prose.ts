/**
 * What each Markdown node becomes.
 *
 * One table, because the alternative is a switch that grows a case at the
 * bottom every time somebody meets a construct the renderer had not seen. What
 * is not in the table renders its children, so an unhandled construct loses its
 * wrapper and never its content.
 *
 * The node names are Lezer's. They were read off a parse rather than taken from
 * the documentation, because a name that is nearly right matches nothing and
 * fails by rendering less than was written.
 */

/** How the children of a node are gathered. */
export type Content =
  /** Blocks, with the whitespace between them dropped. */
  | "block"
  /** Inline nodes, with the gaps between them kept as text. */
  | "inline"
  /** Inline nodes, with the whitespace at either end taken off. */
  | "heading"
  /** Nothing inside it at all. */
  | "empty";

/** A Markdown node and the tag it is drawn as. */
export type Prose = { tag: string; content: Content };

/** Every Markdown node with a tag of its own. */
export const PROSE: Readonly<Record<string, Prose>> = {
  Paragraph: { tag: "p", content: "inline" },

  ATXHeading1: { tag: "h1", content: "heading" },
  ATXHeading2: { tag: "h2", content: "heading" },
  ATXHeading3: { tag: "h3", content: "heading" },
  ATXHeading4: { tag: "h4", content: "heading" },
  ATXHeading5: { tag: "h5", content: "heading" },
  ATXHeading6: { tag: "h6", content: "heading" },
  SetextHeading1: { tag: "h1", content: "heading" },
  SetextHeading2: { tag: "h2", content: "heading" },

  Blockquote: { tag: "blockquote", content: "block" },
  BulletList: { tag: "ul", content: "block" },
  OrderedList: { tag: "ol", content: "block" },
  HorizontalRule: { tag: "hr", content: "empty" },
  HardBreak: { tag: "br", content: "empty" },

  Emphasis: { tag: "em", content: "inline" },
  StrongEmphasis: { tag: "strong", content: "inline" },
  Strikethrough: { tag: "del", content: "inline" },
  InlineCode: { tag: "code", content: "inline" },
};

/**
 * Nodes that are syntax rather than content.
 *
 * A mark covers the characters that said what something is, and those
 * characters are not part of what was said. They are listed rather than matched
 * by their suffix, because a name ending in `Mark` is a coincidence and this is
 * a decision.
 */
export const MARKS: ReadonlySet<string> = new Set([
  "HeaderMark",
  "EmphasisMark",
  "StrikethroughMark",
  "CodeMark",
  "CodeInfo",
  "LinkMark",
  "ListMark",
  "QuoteMark",
  "TaskMarker",
  "TableDelimiter",
]);

/**
 * The four named entities that mean something in every document, and the two a
 * person types on purpose.
 *
 * Deliberately short. HTML names two thousand of these and a document written
 * by a person uses none of them, because a person types the character. The full
 * table belongs where HTML is actually read, which is the migration off the old
 * site (#98); anything not named here reaches the page exactly as it was
 * written, which is visible rather than silent.
 */
export const ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};
