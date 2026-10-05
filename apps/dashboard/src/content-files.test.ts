import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { type MediaKind, uploadKindOf } from "@layered/schemas";
import { afterEach, describe, expect, it } from "vitest";
import type { MediaLibrary } from "./content-completion.js";
import { contentLanguage } from "./content-editor.js";
import { componentForFile, contentFileDrop } from "./content-files.js";

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
});

/**
 * A library that takes every file of a type it accepts, under its name without
 * the extension, and refuses the rest, the way the dashboard's upload does.
 */
function library(): { source: MediaLibrary; given: string[] } {
  const given: string[] = [];
  const source: MediaLibrary = {
    search: async () => [],
    upload: async () => null,
    uploadFiles: async (files, uploaded) => {
      for (const file of files) {
        given.push(file.name);
        const kind: MediaKind | undefined = uploadKindOf(file.type);
        if (kind) uploaded({ kind, slug: file.name.replace(/\.[a-z]+$/, "") });
      }
    },
    uploadLabel: () => "Upload…",
  };
  return { source, given };
}

/** A surface with the file handling, holding a document with the cursor at its end. */
function surface(doc: string, source: MediaLibrary): EditorView {
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc,
      selection: { anchor: doc.length },
      extensions: [contentLanguage(), contentFileDrop(source)],
    }),
  });
  views.push(view);
  return view;
}

/** An event of the given type carrying files, the way the browser hands a drop or a paste over. */
function carrying(type: "drop" | "paste", files: File[]): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const transfer = { files, getData: () => "", types: files.length > 0 ? ["Files"] : [] };
  Object.defineProperty(event, type === "drop" ? "dataTransfer" : "clipboardData", { value: transfer });
  Object.defineProperties(event, { clientX: { value: 0 }, clientY: { value: 0 } });
  return event;
}

const picture = (name: string) => new File(["bytes"], name, { type: "image/png" });

describe("the component a file becomes", () => {
  it("is the one the register shows that kind with, naming the file", () => {
    expect(componentForFile("image", "workbench")).toBe('Image("workbench")');
  });

  it("keeps a value the component cannot do without as a placeholder", () => {
    expect(componentForFile("model", "soundbox")).toBe('Model("soundbox", alt: "")');
  });
});

describe("dropping and pasting files", () => {
  it("inserts the picture's component when a picture is dropped", () => {
    const { source } = library();
    const view = surface("", source);
    view.contentDOM.dispatchEvent(carrying("drop", [picture("workbench.png")]));
    expect(view.state.doc.toString()).toBe('Image("workbench")');
  });

  it("inserts one component per file, in the order they were dropped", () => {
    const { source } = library();
    const view = surface("Some text.", source);
    view.contentDOM.dispatchEvent(carrying("drop", [picture("first.png"), picture("second.png")]));
    expect(view.state.doc.toString()).toBe('Some text.\n\nImage("first")\n\nImage("second")');
  });

  it("changes nothing for a file the library refuses", () => {
    const { source, given } = library();
    const view = surface("Some text.", source);
    view.contentDOM.dispatchEvent(carrying("drop", [new File(["bytes"], "clip.mp4", { type: "video/mp4" })]));
    expect(given).toEqual(["clip.mp4"]);
    expect(view.state.doc.toString()).toBe("Some text.");
  });

  it("inserts a pasted picture the same way", () => {
    const { source } = library();
    const view = surface("", source);
    view.contentDOM.dispatchEvent(carrying("paste", [picture("pasted.png")]));
    expect(view.state.doc.toString()).toBe('Image("pasted")');
  });

  it("leaves a paste without files to the surface", () => {
    const { source, given } = library();
    const view = surface("Some text.", source);
    view.contentDOM.dispatchEvent(carrying("paste", []));
    expect(given).toEqual([]);
  });
});
