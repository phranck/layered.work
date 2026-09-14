import { type MarkdownParser, parser as markdown } from "@lezer/markdown";
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

/** Markdown, plus the component syntax. */
export const parser: MarkdownParser = markdown.configure(componentSyntax);

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
