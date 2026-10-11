import { GFM, type MarkdownExtension, type MarkdownParser, parser as markdown } from "@lezer/markdown";
import type { ContentProfile } from "../profile.js";
import { componentSyntax, mailPlaceholderSyntax, valueReferenceSyntax } from "./extension.js";

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
 * What the language adds to CommonMark: what GitHub added to Markdown, and the
 * component syntax.
 *
 * GFM is here because the epic promises that tables stay Markdown, and a table
 * is not Markdown as the specification wrote it. Strikethrough, task lists and
 * bare links come in the same bundle, which is what anybody writing Markdown
 * today expects of it; taking the table alone would leave three surprises.
 *
 * The dashboard's editor configures its parser from this same list, which is
 * what makes the editor's tree the server's tree.
 */
export const CONTENT_SYNTAX = [GFM, componentSyntax];

/**
 * What each profile is parsed with. The two narrower ones have no components,
 * because they are a few lines of prose, and a mail reads its template's
 * placeholders where the others read named values.
 */
const PROFILE_SYNTAX: Readonly<Record<ContentProfile, MarkdownExtension[]>> = {
  entry: CONTENT_SYNTAX,
  mail: [GFM, mailPlaceholderSyntax],
  inline: [GFM, valueReferenceSyntax],
};

/** The parser the server, the renderer and the validator use. */
export const parser: MarkdownParser = markdown.configure(CONTENT_SYNTAX);

/** A parser for each profile, built once. */
const PROFILE_PARSERS: Record<ContentProfile, MarkdownParser> = {
  entry: parser,
  mail: markdown.configure(PROFILE_SYNTAX.mail),
  inline: markdown.configure(PROFILE_SYNTAX.inline),
};

/**
 * What a text in a profile is parsed with, which the dashboard's editor builds
 * its language from so that its tree is the server's tree.
 *
 * @param profile - The profile the text is written in.
 */
export function syntaxOf(profile: ContentProfile) {
  return PROFILE_SYNTAX[profile];
}

/**
 * Parses a document.
 *
 * @param text - The document as written.
 * @param profile - The profile it is written in. The whole language unless said otherwise.
 * @returns The tree, whose positions are positions in `text`.
 */
export function parseContent(text: string, profile: ContentProfile = "entry") {
  return PROFILE_PARSERS[profile].parse(text);
}

export * from "./dedent.js";
export * from "./nodes.js";
export * from "./read.js";
export * from "./scan.js";
export * from "./value.js";
