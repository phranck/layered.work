import { highlightTree, type Tag, tags } from "@lezer/highlight";
import { describe, expect, it } from "vitest";
import { contentLanguage } from "./content-editor.js";
import { CONTENT_TAGS, contentHighlightStyle } from "./content-highlight.js";

/**
 * What colour each part of a document gets.
 *
 * Asked of the highlighter itself over the editor's own tree, so these hold
 * whatever the browser does with the classes afterwards.
 */

/** Each role, as the letter it is written with under the text, and its tag. */
const ROLES: [letter: string, tag: Tag][] = [
  ["N", CONTENT_TAGS.componentName],
  ["A", CONTENT_TAGS.argumentName],
  ["S", CONTENT_TAGS.syntax],
  ["Q", tags.string],
  ["9", tags.number],
  ["K", tags.atom],
  ["X", tags.invalid],
  ["C", tags.monospace],
  ["H", tags.heading],
  ["B", tags.strong],
  ["I", tags.emphasis],
  ["M", tags.processingInstruction],
];

/**
 * The role of every character, written under the text: one letter per role,
 * and a dot where nothing colours it.
 */
function roles(text: string): string {
  const byClass = new Map(ROLES.map(([letter, tag]) => [contentHighlightStyle.style([tag]) ?? "", letter]));
  const line = Array.from(text, () => ".");
  const tree = contentLanguage().language.parser.parse(text);
  highlightTree(tree, contentHighlightStyle, (from, to, classes) => {
    const letter = classes
      .split(" ")
      .map((name) => byClass.get(name))
      .find(Boolean);
    for (let at = from; at < to; at += 1) line[at] = letter ?? ".";
  });
  return line.join("");
}

/** The roles of one line of a document. */
function under(text: string, line: number): string {
  const lines = text.split("\n");
  const start = lines.slice(0, line).join("\n").length + (line > 0 ? 1 : 0);
  return roles(text).slice(start, start + (lines[line]?.length ?? 0));
}

describe("the colours of a document", () => {
  it("gives a component's name, its argument names, its values and its punctuation each their own", () => {
    const text = 'Grid(columns: 3, spacing: 4, title: "x") {\n  Text.\n}';
    expect(under(text, 0)).toBe("NNNNSAAAAAAASSKSSAAAAAAASSKSSAAAAASSQQQSSS");
    expect(under(text, 2)).toBe("S");
  });

  it("colours a keyword value and leaves the prose of a body to Markdown", () => {
    const text = "Note(tone: warning) {\n  Plain **bold**.\n}";
    expect(under(text, 0)).toBe("NNNNSAAAASSKKKKKKKSSS");
    expect(under(text, 1)).toBe("........BBBBBBBB.");
  });

  it("colours a component written inside a fenced block as code", () => {
    expect(under("```\nNote(tone: info) {\n```", 1)).toBe("C".repeat("Note(tone: info) {".length));
  });

  it("marks what the parser could not read", () => {
    expect(roles('Image("front"')).toBe("NNNNNXXXXXXXX");
  });

  it("colours the backslash of an escaped component line as the language's punctuation", () => {
    expect(roles("\\Grid(3) lines.")).toBe("S..............");
  });

  it("colours emphasis in a paragraph, its marks included", () => {
    expect(roles("Was it *NeXTstep*, or not?")).toBe(".......IIIIIIIIII.........");
  });

  it("colours a heading, its mark included", () => {
    expect(roles("## Head")).toBe("HHHHHHH");
  });
});
