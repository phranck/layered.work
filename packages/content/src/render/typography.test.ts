import { describe, expect, it } from "vitest";
import { renderContent } from "./render.js";

describe("localized prose typography", () => {
  it("curls English and German quotation marks and apostrophes", () => {
    expect(renderContent('"Next" is Apple\'s machine.', { language: "en" })).toEqual([
      {
        kind: "element",
        tag: "p",
        attributes: {},
        children: [{ kind: "text", value: "“Next” is Apple’s machine." }],
      },
    ]);
    expect(renderContent('"NeXT" ist Apple\'s Rechner.', { language: "de" })).toEqual([
      {
        kind: "element",
        tag: "p",
        attributes: {},
        children: [{ kind: "text", value: "„NeXT“ ist Apple’s Rechner." }],
      },
    ]);
  });

  it("keeps a quotation paired across inline markup", () => {
    expect(renderContent('She said "*small* word".', { language: "en" })).toEqual([
      {
        kind: "element",
        tag: "p",
        attributes: {},
        children: [
          { kind: "text", value: "She said “" },
          { kind: "element", tag: "em", attributes: {}, children: [{ kind: "text", value: "small" }] },
          { kind: "text", value: " word”." },
        ],
      },
    ]);
  });

  it("distinguishes single quotations from apostrophes at word endings", () => {
    expect(renderContent("'a *small* word' and the dogs' tails.", { language: "en" })).toEqual([
      {
        kind: "element",
        tag: "p",
        attributes: {},
        children: [
          { kind: "text", value: "‘a " },
          { kind: "element", tag: "em", attributes: {}, children: [{ kind: "text", value: "small" }] },
          { kind: "text", value: " word’ and the dogs’ tails." },
        ],
      },
    ]);
    const paragraphs = renderContent("'first'*word* 'second'.", { language: "en" });
    expect(JSON.stringify(paragraphs)).toContain('"value":" ‘second’."');
  });

  it("leaves component arguments and inline and fenced code exactly as written", () => {
    const rendered = renderContent(
      'Image("front", caption: "A photo")\n\n`"code"` and "prose".\n\n```txt\n"block"\n```',
      { language: "en" },
    );
    expect(rendered).toEqual([
      {
        kind: "component",
        name: "Image",
        renders: "Figure",
        props: { slug: "front", caption: "A photo" },
        children: [],
      },
      {
        kind: "element",
        tag: "p",
        attributes: {},
        children: [
          { kind: "element", tag: "code", attributes: {}, children: [{ kind: "text", value: '"code"' }] },
          { kind: "text", value: " and “prose”." },
        ],
      },
      { kind: "code", language: "txt", source: '"block"' },
    ]);
  });
});
