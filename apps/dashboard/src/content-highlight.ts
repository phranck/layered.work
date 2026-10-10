import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { NODE } from "@layered/content";
import { styleTags, Tag, tags } from "@lezer/highlight";
import type { MarkdownConfig } from "@lezer/markdown";

/**
 * How the writing surface colours what is written.
 *
 * Every colour is chosen by a node of the parse tree, never by a pattern over
 * the text, so the colouring cannot disagree with the parser: a brace inside a
 * fenced block is code because the parser says it is, and a component the
 * parser could not read is marked because the parser marked it.
 *
 * The colours are the `--md-*` properties of the workbench scope. They are the
 * one set that deliberately follows no palette, because each role has to stay
 * distinguishable from the others, which a palette cannot promise.
 */

/** The roles the content language adds to Markdown's, as highlight tags. */
export const CONTENT_TAGS = {
  /** A component's name, which is what the register is looked up by. */
  componentName: Tag.define(),
  /** The name of one argument, before its colon. */
  argumentName: Tag.define(),
  /** Brackets, braces, commas and colons: the language's own punctuation. */
  syntax: Tag.define(),
  /** The name inside a reference to a named value. */
  valueName: Tag.define(),
} as const;

/**
 * The content language's nodes, given their tags.
 *
 * A tag here covers only the node's own characters between its children, which
 * is exactly what makes `Component` the braces, `ComponentArguments` the
 * brackets and commas, and `ComponentArgument` the colon, whilst the names, the
 * values and the body keep tags of their own. A props-only extension, so the
 * tree it is added to is the tree the server parses.
 */
export const componentHighlighting: MarkdownConfig = {
  props: [
    styleTags({
      [NODE.Component]: CONTENT_TAGS.syntax,
      [NODE.ComponentArguments]: CONTENT_TAGS.syntax,
      [NODE.ComponentArgument]: CONTENT_TAGS.syntax,
      [NODE.ComponentName]: CONTENT_TAGS.componentName,
      [NODE.ArgumentName]: CONTENT_TAGS.argumentName,
      [NODE.ArgumentString]: tags.string,
      [NODE.ArgumentNumber]: tags.number,
      [NODE.ArgumentKeyword]: tags.atom,
      [NODE.ArgumentUnknown]: tags.invalid,
      [NODE.ComponentError]: tags.invalid,
      [NODE.ComponentEscape]: CONTENT_TAGS.syntax,
      // The braces and spaces of a reference are its own characters, and the
      // name is a child with a tag of its own.
      [NODE.ValueReference]: CONTENT_TAGS.syntax,
      [NODE.ValueName]: CONTENT_TAGS.valueName,
    }),
  ],
};

/** A colour of the workbench's syntax scheme, by its role's property. */
const scheme = (role: string) => `var(--md-${role})`;

/**
 * The colour, weight and line of every tag, Markdown's and the language's.
 *
 * Markdown's marks share one muted colour so the words they mark stay the thing
 * read. Bold and italic keep their meaning as weight and slant as well as
 * colour, because colour alone asks a reader to compare two hues.
 */
export const contentHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, color: scheme("heading"), fontWeight: "var(--weight-semibold)" },
  { tag: tags.emphasis, color: scheme("emphasis"), fontStyle: "italic" },
  { tag: tags.strong, color: scheme("emphasis"), fontWeight: "var(--weight-semibold)" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.monospace, color: scheme("code") },
  { tag: tags.quote, color: scheme("quote") },
  { tag: tags.link, textDecoration: "underline", textUnderlineOffset: "2px" },
  {
    tag: [tags.url, tags.processingInstruction, tags.labelName, tags.contentSeparator],
    color: scheme("punctuation"),
  },
  { tag: CONTENT_TAGS.componentName, color: scheme("shortcode-token") },
  { tag: CONTENT_TAGS.argumentName, color: scheme("shortcode-attribute") },
  { tag: CONTENT_TAGS.syntax, color: scheme("shortcode-brace") },
  { tag: CONTENT_TAGS.valueName, color: scheme("value") },
  { tag: tags.string, color: scheme("shortcode-string") },
  { tag: [tags.number, tags.atom], color: scheme("shortcode-target") },
  // What the parser could not read is underlined like an error the validator
  // found, by the one rule in `content-validation.css` that draws both.
  { tag: tags.invalid, class: "content-invalid" },
]);

/** The colouring, as one extension for the surface. */
export function contentHighlighting() {
  return syntaxHighlighting(contentHighlightStyle);
}
