import { history, undo } from "@codemirror/commands";
import { EditorState, type TransactionSpec } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { contentLanguage } from "./content-editor.js";
import { tableSync } from "./table-sync.js";

/**
 * A table's rows following its columns, edit by edit, the way the editor
 * applies them: through the state, with the history attached.
 */

/** A state holding the text, with the sync and the history. */
function stateOf(text: string): EditorState {
  return EditorState.create({ doc: text, extensions: [contentLanguage(), tableSync(), history()] });
}

/** The state after one edit, as a person would make it. */
function edit(state: EditorState, spec: TransactionSpec): EditorState {
  return state.update({ ...spec, userEvent: "input" }).state;
}

/** Replaces the first occurrence of a piece of text. */
function replace(state: EditorState, find: string, insert: string): EditorState {
  const from = state.doc.toString().indexOf(find);
  if (from < 0) throw new Error(`${find} is not in the document`);
  return edit(state, { changes: { from, to: from + find.length, insert } });
}

const TABLE = [
  "Table {",
  '  TableColumn("Part", value: part)',
  "",
  '  TableRow(part: "Screw")',
  '  TableRow(part: "Panel")',
  "}",
].join("\n");

describe("a table's rows", () => {
  it("gain the field of a column that is added", () => {
    const state = replace(
      stateOf(TABLE),
      "value: part)\n",
      'value: part)\n  TableColumn("Count", value: count)\n',
    );
    expect(state.doc.toString()).toContain('TableRow(part: "Screw", count: "")');
    expect(state.doc.toString()).toContain('TableRow(part: "Panel", count: "")');
  });

  it("place a new field after the field of the column before it", () => {
    const start = stateOf(
      TABLE.replace("value: part)", 'value: part)\n  TableColumn("Note", value: note)').replace(
        /TableRow\(part: "(\w+)"\)/g,
        'TableRow(part: "$1", note: "n")',
      ),
    );
    const state = replace(start, "value: part)\n", 'value: part)\n  TableColumn("Count", value: count)\n');
    expect(state.doc.toString()).toContain('TableRow(part: "Screw", count: "", note: "n")');
  });

  it("lose the field of a column that is deleted, and keep fields no column showed", () => {
    const start = stateOf(
      TABLE.replace("value: part)", 'value: part)\n  TableColumn("Count", value: count)').replace(
        /TableRow\(part: "(\w+)"\)/g,
        'TableRow(part: "$1", count: "1", supplier: "S")',
      ),
    );
    const state = replace(start, '  TableColumn("Count", value: count)\n', "");
    expect(state.doc.toString()).toContain('TableRow(part: "Screw", supplier: "S")');
    expect(state.doc.toString()).not.toContain("count");
  });

  it("keep their values when a column's field is renamed letter by letter", () => {
    let state = stateOf(TABLE);
    // Delete "part" one letter at a time, then type "name", as an author would.
    for (let left = 4; left > 0; left -= 1) {
      const at = state.doc.toString().indexOf("value: ") + "value: ".length;
      state = edit(state, { changes: { from: at + left - 1, to: at + left } });
    }
    for (const letter of "name") {
      const at = state.doc.toString().indexOf("value: ") + "value: ".length;
      const end = state.doc.toString().indexOf(")", at);
      state = edit(state, { changes: { from: end, insert: letter } });
    }
    expect(state.doc.toString()).toContain('TableColumn("Part", value: name)');
    expect(state.doc.toString()).toContain('TableRow(name: "Screw")');
    expect(state.doc.toString()).toContain('TableRow(name: "Panel")');
  });

  it("leave another table alone when a column of the same field is deleted", () => {
    const other = '\n\nTable {\n  TableColumn("Part", value: part)\n  TableRow(part: "Other", count: "9")\n}';
    const start = stateOf(
      TABLE.replace("value: part)", 'value: part)\n  TableColumn("Count", value: count)').replace(
        /TableRow\(part: "(\w+)"\)/g,
        'TableRow(part: "$1", count: "1")',
      ) + other,
    );
    const state = replace(start, '  TableColumn("Count", value: count)\n', "");
    expect(state.doc.toString()).toContain('TableRow(part: "Other", count: "9")');
    expect(state.doc.toString()).toContain('TableRow(part: "Screw")');
  });

  it("come back with the column in one undo", () => {
    const start = stateOf(
      TABLE.replace("value: part)", 'value: part)\n  TableColumn("Count", value: count)').replace(
        /TableRow\(part: "(\w+)"\)/g,
        'TableRow(part: "$1", count: "1")',
      ),
    );
    let state = replace(start, '  TableColumn("Count", value: count)\n', "");
    expect(state.doc.toString()).not.toContain("count");
    undo({
      state,
      dispatch: (transaction) => {
        state = transaction.state;
      },
    });
    expect(state.doc.toString()).toBe(start.doc.toString());
  });

  it("gain a new last column's field last, even when it starts out as another column's field", () => {
    const two = TABLE.replace("value: part)", 'value: part)\n  TableColumn("Count", value: count)').replace(
      /TableRow\(part: "(\w+)"\)/g,
      'TableRow(part: "$1", count: "1")',
    );
    // A column whose field begins as one another column shows, then is typed
    // over letter by letter, as a placeholder in a snippet is.
    let state = replace(
      stateOf(two),
      "value: count)\n",
      'value: count)\n  TableColumn("Year", value: part)\n',
    );
    const at = () => state.doc.toString().lastIndexOf("value: part)") + "value: ".length;
    state = edit(state, { changes: { from: at(), to: at() + 4, insert: "y" } });
    for (const letter of "ear") {
      const end = state.doc.toString().indexOf(")", state.doc.toString().indexOf('"Year"'));
      state = edit(state, { changes: { from: end, insert: letter } });
    }
    expect(state.doc.toString()).toContain('TableColumn("Year", value: year)');
    expect(state.doc.toString()).toContain('TableRow(part: "Screw", count: "1", year: "")');
    expect(state.doc.toString()).toContain('TableRow(part: "Panel", count: "1", year: "")');
  });

  it("place a new field after the nearest earlier field a row has", () => {
    const start = stateOf(
      TABLE.replace("value: part)", 'value: part)\n  TableColumn("Count", value: count)').replace(
        /TableRow\(part: "(\w+)"\)/g,
        'TableRow(part: "$1", supplier: "S")',
      ),
    );
    const state = replace(start, "value: count)\n", 'value: count)\n  TableColumn("Year", value: year)\n');
    expect(state.doc.toString()).toContain('TableRow(part: "Screw", year: "", supplier: "S")');
  });

  it("are not touched by prose written outside a table", () => {
    const state = edit(stateOf(`Some words.\n\n${TABLE}`), { changes: { from: 4, insert: " more" } });
    expect(state.doc.toString()).toBe(`Some more words.\n\n${TABLE}`);
  });
});
