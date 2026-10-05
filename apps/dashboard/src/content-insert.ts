import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { INDENT_UNIT } from "./editor-toolbar.js";

/**
 * Putting a component into the writing surface, wherever it comes from: a tool
 * in the toolbar, or a file dropped or pasted onto the text. Both place it the
 * same way, so a component never lands differently depending on how it arrived.
 */

/**
 * Inserts a block on lines of its own at every selection.
 *
 * A component is a block, so it never splits a line of prose: on an empty line
 * it replaces the selection, and in text it goes after the line, a blank line
 * apart. The cursor then goes to the first empty quotes in the block, or into
 * an empty body, or to its end, which is where the author writes next.
 *
 * @param view - The surface.
 * @param text - The block, such as a component written from the register.
 */
export function insertComponentBlock(view: EditorView, text: string): void {
  view.dispatch(
    view.state.changeByRange((range) => {
      const line = view.state.doc.lineAt(range.from);
      const inText = line.text.trim() !== "";
      const from = inText ? line.to : range.from;
      const to = inText ? line.to : range.to;
      const lead = inText ? "\n\n" : "";
      const quotes = text.indexOf('""');
      const body = text.indexOf(`{\n${INDENT_UNIT}\n}`);
      const cursor = quotes >= 0 ? quotes + 1 : body >= 0 ? body + `{\n${INDENT_UNIT}`.length : text.length;
      return {
        changes: { from, to, insert: `${lead}${text}` },
        range: EditorSelection.cursor(from + lead.length + cursor),
      };
    }),
  );
}
