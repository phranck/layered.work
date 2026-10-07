import { CompletionContext } from "@codemirror/autocomplete";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { COMPONENT_NAMES, components, SPACE_STEPS } from "@layered/content";
import type { MediaKind } from "@layered/schemas";
import { describe, expect, it, vi } from "vitest";
import {
  contentCompletions,
  type KnownValue,
  type LibraryFile,
  libraryCompletions,
  type MediaLibrary,
  valueCompletions,
} from "./content-completion.js";
import { contentLanguage } from "./content-editor.js";

/**
 * What completion offers where the cursor stands.
 *
 * The cursor is written into the document as `|`, and the labels of what is
 * offered are compared, because the labels are what the author picks from.
 */

/** The labels offered at the `|` in the text. */
function offered(textWithCursor: string, explicit = false): string[] | null {
  const position = textWithCursor.indexOf("|");
  const doc = textWithCursor.replace("|", "");
  const state = EditorState.create({ doc, selection: { anchor: position }, extensions: [contentLanguage()] });
  ensureSyntaxTree(state, doc.length, 5000);
  const result = contentCompletions(new CompletionContext(state, position, explicit));
  return result ? result.options.map((option) => option.label) : null;
}

/** The components that stand on their own. */
const STANDALONE = COMPONENT_NAMES.filter((name) => !("within" in components[name]));

describe("component names", () => {
  it("are offered at the start of a line while a name is typed, every one that stands on its own", () => {
    expect(offered("Gr|")).toEqual(STANDALONE);
  });

  it("are offered on an empty line only when asked for", () => {
    expect(offered("|")).toBeNull();
    expect(offered("|", true)).toEqual(STANDALONE);
  });

  it("inside a table are its parts and nothing else", () => {
    expect(offered('Table {\n  TableColumn("A", value: a)\n  Ta|\n}')).toEqual(["TableColumn", "TableRow"]);
  });

  it("are not offered in the middle of a sentence", () => {
    expect(offered("Some words and Gr|")).toBeNull();
  });

  it("insert a snippet with its required values and its body", () => {
    const state = EditorState.create({
      doc: "Not",
      selection: { anchor: 3 },
      extensions: [contentLanguage()],
    });
    const note = contentCompletions(new CompletionContext(state, 3, false))?.options.find(
      (option) => option.label === "Note",
    );
    expect(note?.info).toBe(components.Note.description);
    expect(typeof note?.apply).toBe("function");
  });
});

describe("parameter names", () => {
  it("are the component's own, once the bracket is open", () => {
    expect(offered("Note(|")).toEqual(["tone", "title"]);
  });

  it("leave out the ones already written, wherever they stand", () => {
    expect(offered("Note(tone: info, |")).toEqual(["title"]);
    expect(offered('Note(|, title: "Hi")')).toEqual(["tone"]);
  });

  it("leave out the one already given without its name", () => {
    expect(offered('Image("front", |')).toEqual(["caption", "alt"]);
  });

  it("in a row are the fields its table's columns show and it lacks", () => {
    const text =
      'Table {\n  TableColumn("A", value: part)\n  TableColumn("B", value: count)\n  TableRow(part: "x", |)\n}';
    expect(offered(text)).toEqual(["count"]);
  });
});

describe("values", () => {
  it("of a tone are the tones a note takes", () => {
    expect(offered("Note(tone: |")).toEqual([...components.Note.parameters.tone.values]);
  });

  it("of a spacing are the steps of the space scale", () => {
    expect(offered("VStack(spacing: |")).toEqual([...SPACE_STEPS]);
  });

  it("of a flag are true and false", () => {
    expect(offered("HStack(wrap: |")).toEqual(["true", "false"]);
  });

  it("of a column's field are the fields its table's rows carry", () => {
    const text = 'Table {\n  TableColumn("A", value: |)\n  TableRow(part: "x", supplier: "y")\n}';
    expect(offered(text)).toEqual(["part", "supplier"]);
  });

  it("of text are not offered, because text is the author's own", () => {
    expect(offered("Note(title: |")).toBeNull();
  });
});

describe("files from the media library", () => {
  /** Two pictures, newest first, and a model, as the library would answer. */
  const FILES: LibraryFile[] = [
    { slug: "newest-picture", kind: "image", url: "/media/1/content" },
    { slug: "older-picture", kind: "image", url: "/media/2/content" },
    { slug: "soundbox", kind: "model", url: null },
  ];

  /** A library that answers with the files of the kind it is asked for, and records every question. */
  function library(uploaded: string | null = null) {
    const asked: [MediaKind, string][] = [];
    const uploads: MediaKind[] = [];
    const source: MediaLibrary = {
      search: async (kind, query) => {
        asked.push([kind, query]);
        return FILES.filter((file) => file.kind === kind);
      },
      upload: async (kind) => {
        uploads.push(kind);
        return uploaded;
      },
      uploadFiles: async () => {},
      uploadLabel: () => "Upload…",
    };
    return { source, asked, uploads };
  }

  /** What the library source offers with the cursor where the bar stands. */
  function offeredFiles(textWithCursor: string, source: MediaLibrary) {
    const position = textWithCursor.indexOf("|");
    const state = EditorState.create({
      doc: textWithCursor.replace("|", ""),
      extensions: [contentLanguage()],
    });
    return libraryCompletions(source)(new CompletionContext(state, position, false));
  }

  /** A surface holding `Image("ne)` with the cursor after what has been typed. */
  function typingImage(): EditorView {
    return new EditorView({
      parent: document.body,
      state: EditorState.create({
        doc: 'Image("ne)',
        selection: { anchor: 9 },
        extensions: [contentLanguage()],
      }),
    });
  }

  it("lists only pictures inside Image's quotes, as the library orders them, with the upload last", async () => {
    const { source, asked } = library();
    const result = await offeredFiles('Image("|', source);
    expect(result?.options.map((option) => option.label)).toEqual([
      "newest-picture",
      "older-picture",
      "Upload…",
    ]);
    expect(result?.filter).toBe(false);
    expect(asked).toEqual([["image", ""]]);
  });

  it("lists only models inside Model's quotes, and offers no upload the library would refuse", async () => {
    const { source, asked } = library();
    const result = await offeredFiles('Model("|', source);
    expect(result?.options.map((option) => option.label)).toEqual(["soundbox"]);
    expect(asked).toEqual([["model", ""]]);
  });

  it("asks for what has been typed, and for the kind a named parameter takes", async () => {
    const { source, asked } = library();
    await offeredFiles('Model("soundbox", poster: "old|', source);
    expect(asked).toEqual([["image", "old"]]);
  });

  it("offers nothing in the quotes of a parameter that names no file", async () => {
    const { source, asked } = library();
    expect(await offeredFiles('Image("front", caption: "The |', source)).toBeNull();
    expect(asked).toEqual([]);
  });

  it("inserts the slug, never a path, and closes the quotes", async () => {
    const { source } = library();
    const view = typingImage();
    const result = await libraryCompletions(source)(new CompletionContext(view.state, 9, false));
    const option = result?.options[0];
    if (!result || typeof option?.apply !== "function") throw new Error("Missing entry");
    option.apply(view, option, result.from, 9);
    expect(view.state.doc.toString()).toBe('Image("newest-picture")');
    expect(view.state.selection.main.head).toBe('Image("newest-picture"'.length);
    view.destroy();
  });

  it("uploads from the list and leaves the new file's slug where the author was typing", async () => {
    const { source, uploads } = library("fresh-upload");
    const view = typingImage();
    const result = await libraryCompletions(source)(new CompletionContext(view.state, 9, false));
    const upload = result?.options.at(-1);
    if (!result || typeof upload?.apply !== "function") throw new Error("Missing upload");
    upload.apply(view, upload, result.from, 9);
    await vi.waitFor(() => expect(view.state.doc.toString()).toBe('Image("fresh-upload")'));
    expect(uploads).toEqual(["image"]);
    view.destroy();
  });
});

describe("named values", () => {
  const VALUES: KnownValue[] = [
    { name: "product", value: "Velvet" },
    { name: "version", value: "2.1" },
  ];

  /** What the value source offers with the cursor where the bar stands. */
  function offeredValues(textWithCursor: string) {
    const position = textWithCursor.indexOf("|");
    const doc = textWithCursor.replace("|", "");
    const state = EditorState.create({ doc, extensions: [contentLanguage()] });
    ensureSyntaxTree(state, doc.length, 5000);
    return valueCompletions(() => VALUES)(new CompletionContext(state, position, false));
  }

  /** The document after the first value is taken, and where the cursor ends up. */
  function taking(textWithCursor: string) {
    const position = textWithCursor.indexOf("|");
    const view = new EditorView({
      parent: document.body,
      state: EditorState.create({
        doc: textWithCursor.replace("|", ""),
        selection: { anchor: position },
        extensions: [contentLanguage()],
      }),
    });
    const result = valueCompletions(() => VALUES)(new CompletionContext(view.state, position, false));
    const option = result?.options[0];
    if (!result || typeof option?.apply !== "function") throw new Error("Missing entry");
    option.apply(view, option, result.from, position);
    const taken = { doc: view.state.doc.toString(), head: view.state.selection.main.head };
    view.destroy();
    return taken;
  }

  it("are offered after two braces, with each value's text beside its name", () => {
    const result = offeredValues("Made with {{ |");
    expect(result?.options.map((option) => [option.label, option.detail])).toEqual([
      ["product", "Velvet"],
      ["version", "2.1"],
    ]);
    expect(offeredValues("Made with {{pro|")?.from).toBe("Made with {{".length);
  });

  it("are not offered outside a reference or inside code", () => {
    expect(offeredValues("Made with |")).toBeNull();
    expect(offeredValues("Made with { |")).toBeNull();
    expect(offeredValues("Write `{{ |` like this.")).toBeNull();
    expect(offeredValues("```\n{{ |\n```")).toBeNull();
  });

  it("close the reference, keeping the braces the bracket closing typed, and put the cursor after it", () => {
    expect(taking("Made with {{ |}}")).toEqual({ doc: "Made with {{ product }}", head: 23 });
    expect(taking("Made with {{|}}")).toEqual({ doc: "Made with {{ product }}", head: 23 });
    expect(taking("Made with {{ |")).toEqual({ doc: "Made with {{ product }}", head: 23 });
  });
});
