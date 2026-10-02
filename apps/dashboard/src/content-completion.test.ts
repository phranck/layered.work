import { CompletionContext } from "@codemirror/autocomplete";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { COMPONENT_NAMES, components, SPACE_STEPS } from "@layered/content";
import { describe, expect, it } from "vitest";
import { contentCompletions } from "./content-completion.js";
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
