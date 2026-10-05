import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { parseContent } from "@layered/content";
import { cleanup, render, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContentEditor, type ContentEditorHandle, contentLanguage } from "./content-editor.js";

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
  it("underlines an unknown component after typing pauses and selects the finding", async () => {
    const checked = vi.fn();
    const handle = createRef<ContentEditorHandle>();
    const { container, rerender } = render(
      <ContentEditor
        value="Carousel { Text. }"
        onChange={vi.fn()}
        onValidation={checked}
        editorRef={handle}
        label="Text"
      />,
    );
    await waitFor(() => expect(container.querySelector(".cm-lintRange-error")?.textContent).toBe("Carousel"));
    expect(checked.mock.calls.at(-1)?.[0]).toMatchObject({
      source: "Carousel { Text. }",
      validation: { publishable: false },
    });
    const cm = container.querySelector(".cm-editor");
    if (!(cm instanceof HTMLElement)) throw new Error("Missing editor");
    handle.current?.selectFinding({ from: 0, to: 8 });
    expect(EditorView.findFromDOM(cm)?.state.selection.main.to).toBe(8);
    rerender(
      <ContentEditor
        value="Correct prose."
        onChange={vi.fn()}
        onValidation={checked}
        editorRef={handle}
        label="Text"
      />,
    );
    await waitFor(() =>
      expect(checked.mock.calls.at(-1)?.[0]).toMatchObject({
        source: "Correct prose.",
        validation: { publishable: true },
      }),
    );
    await waitFor(() => expect(container.querySelector(".cm-lintRange-error")).toBeNull());
  });
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

  it("puts the indentation of the whole document right on request", () => {
    const handle = createRef<ContentEditorHandle>();
    const { container } = render(
      <ContentEditor
        value={"VStack {\n        Spacer()\n }"}
        onChange={vi.fn()}
        editorRef={handle}
        label="Text"
      />,
    );
    const cm = container.querySelector(".cm-editor");
    if (!(cm instanceof HTMLElement)) throw new Error("Missing editor");
    handle.current?.reindent();
    expect(EditorView.findFromDOM(cm)?.state.doc.toString()).toBe("VStack {\n  Spacer()\n}");
  });
});
