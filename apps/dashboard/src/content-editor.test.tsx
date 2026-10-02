import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { parseContent } from "@layered/content";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContentEditor, contentLanguage } from "./content-editor.js";

afterEach(cleanup);

/**
 * A document that touches every form the language has: Markdown with GFM,
 * components with and without a body, nested components, every kind of value,
 * an escaped component line and a component inside a fence, which stays an
 * example.
 */
const SAMPLE = `## The enclosure

Two halves in PETG, with **the vents** printed. ~~Not glued.~~ H~2~O and ^up^ stay text.

- [x] Printed
- [ ] Painted

| Part | Material |
| --- | --- |
| Lid | PETG |

Image("front-panel", caption: "The front, before painting")

Grid(columns: 3) {
  Image("front")
  Note(tone: warning) {
    This image wants a card of at least 16 GB.
  }
}

\\Grid(3) lines were enough.

\`\`\`
Image("inside-a-fence")
\`\`\`

See https://layered.work for more.
`;

describe("the writing surface's language", () => {
  it("parses a document into exactly the tree the server parses", () => {
    const state = EditorState.create({ doc: SAMPLE, extensions: [contentLanguage()] });
    const tree = ensureSyntaxTree(state, state.doc.length, 5000);
    expect(tree?.toString()).toBe(parseContent(SAMPLE).toString());
  });

  it("finds components where the server finds them, and none inside a fence", () => {
    const state = EditorState.create({ doc: SAMPLE, extensions: [contentLanguage()] });
    const names: string[] = [];
    ensureSyntaxTree(state, state.doc.length, 5000)?.iterate({
      enter(node) {
        if (node.name === "ComponentName") names.push(state.sliceDoc(node.from, node.to));
      },
    });
    expect(names).toEqual(["Image", "Grid", "Image", "Note"]);
  });
});

describe("the writing surface", () => {
  it("shows the body it is given as plain text", () => {
    const { container } = render(<ContentEditor value={SAMPLE} onChange={vi.fn()} label="Text" />);
    const content = container.querySelector(".cm-content");
    expect(content?.getAttribute("aria-label")).toBe("Text");
    expect(content?.textContent).toContain("Two halves in PETG");
    expect(content?.textContent).toContain('Image("front-panel", caption: "The front, before painting")');
  });

  it("replaces its document when the body changes from outside", () => {
    const { container, rerender } = render(<ContentEditor value="First" onChange={vi.fn()} label="Text" />);
    rerender(<ContentEditor value="Second" onChange={vi.fn()} label="Text" />);
    expect(container.querySelector(".cm-content")?.textContent).toBe("Second");
  });
});
