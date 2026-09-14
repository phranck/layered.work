import { GFM, type MarkdownParser, parser as markdown } from "@lezer/markdown";
import { componentSyntax } from "./extension.js";

/**
 * The parser, which is Markdown with one extension.
 *
 * **The same one runs in the editor and on the server.** That is the whole
 * reason it is built on Lezer: the editor is CodeMirror and CodeMirror parses
 * with Lezer, so a second parser for the browser would be a second answer to
 * what a document means. What the author sees highlighted and what the API
 * refuses would then be able to disagree.
 */

/**
 * Markdown, plus what GitHub added to it, plus the component syntax.
 *
 * GFM is here because the epic promises that tables stay Markdown, and a table
 * is not Markdown as the specification wrote it. Strikethrough, task lists and
 * bare links come in the same bundle, which is what anybody writing Markdown
 * today expects of it; taking the table alone would leave three surprises.
 */
export const parser: MarkdownParser = markdown.configure([GFM, componentSyntax]);

/**
 * Parses a document.
 *
 * @param text - The document as written.
 * @returns The tree, whose positions are positions in `text`.
 */
export function parseContent(text: string) {
  return parser.parse(text);
}

export * from "./dedent.js";
export * from "./nodes.js";
export * from "./scan.js";
