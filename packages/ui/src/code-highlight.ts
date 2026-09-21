import { createHighlighterCoreSync } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import css from "shiki/langs/css.mjs";
import html from "shiki/langs/html.mjs";
import ini from "shiki/langs/ini.mjs";
import javascript from "shiki/langs/javascript.mjs";
import json from "shiki/langs/json.mjs";
import mermaid from "shiki/langs/mermaid.mjs";
import python from "shiki/langs/python.mjs";
import shell from "shiki/langs/shellscript.mjs";
import swift from "shiki/langs/swift.mjs";
import typescript from "shiki/langs/typescript.mjs";
import theme from "shiki/themes/github-dark.mjs";

// Synchronous tokenization keeps the initial server-rendered document colored.
// Include the migrated languages and common web examples, with no client fetch.
let sharedHighlighter: ReturnType<typeof createHighlighterCoreSync> | undefined;
function getHighlighter() {
  // Avoid initializing or retaining grammars in consumers that only import other UI exports.
  sharedHighlighter ??= createHighlighterCoreSync({
    themes: [theme],
    langs: [css, html, ini, javascript, json, mermaid, python, shell, swift, typescript],
    engine: createJavaScriptRegexEngine(),
  });
  return sharedHighlighter;
}

export interface CodeToken {
  offset: number;
  content: string;
  color?: string;
}

/** Token offsets preserve the original whitespace, including CRLF and final newlines. */
export function highlightCode(source: string, language?: string): CodeToken[] {
  const highlighter = getHighlighter();
  const name = language?.trim().toLowerCase();
  const lang = name && highlighter.getLoadedLanguages().includes(name) ? name : "text";
  const tokens = highlighter.codeToTokensBase(source, { lang, theme: theme.name });
  const result: CodeToken[] = [];
  let offset = 0;
  for (const line of tokens) {
    for (const token of line) {
      if (token.offset > offset) {
        result.push({ offset, content: source.slice(offset, token.offset) });
      }
      if (token.content.length) {
        result.push({ offset: token.offset, content: token.content, color: token.color });
      }
      offset = token.offset + token.content.length;
    }
  }
  if (offset < source.length) result.push({ offset, content: source.slice(offset) });
  return result;
}
