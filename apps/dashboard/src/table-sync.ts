import { syntaxTree } from "@codemirror/language";
import {
  type ChangeSpec,
  EditorState,
  type Extension,
  MapMode,
  StateEffect,
  StateField,
  type Transaction,
  type TransactionSpec,
} from "@codemirror/state";
import {
  argumentsOf,
  type ComponentDefinition,
  childOf,
  components,
  NODE,
  parseContent,
  writtenKindOf,
  writtenValueOf,
} from "@layered/content";
import type { SyntaxNode } from "@lezer/common";

/**
 * Keeping a table's rows in step with its columns whilst the author writes.
 *
 * A column added gives every row its field, a column removed takes the field
 * out of every row, and a column whose field is renamed renames it in every row
 * with the values kept. The changes join the edit that caused them in one
 * transaction, so a single undo takes back both.
 *
 * **Renaming is told apart from removing by remembering.** Editing
 * `value: count` into `value: amount` passes through `value: )`, where the
 * column names no field at all. Each column's last valid field is remembered by
 * its position, so the column is still known to have shown `count` when it
 * comes to show `amount`, and the rows' values move across rather than being
 * dropped on the way.
 *
 * Which components are tables, columns and rows is read from the register: a
 * container is a component that `holds` parts, a column is a part with a
 * `field` parameter, and a row is a part that takes `fields`.
 */

/** A register entry, read through the shape every entry has. */
const definitionOf = (name: string): ComponentDefinition | undefined =>
  (components as Readonly<Record<string, ComponentDefinition>>)[name];

/** A column's field, remembered by the position one character into its name. */
type Remembered = { at: number; field: string };

/** One column: a position inside its name, and the field it shows where it names a valid one. */
type Column = { at: number; field: string | null };

/** One argument of a row, by its name and where it stands. */
type RowArgument = { name: string; from: number; to: number; nameFrom: number; nameTo: number };

/** One row: its arguments, and where its argument list opens and closes. */
type Row = { arguments: RowArgument[]; open: number; close: number };

/** One table: its columns and rows, in document order. */
type Table = { from: number; to: number; columns: Column[]; rows: Row[] };

/** Tells the remembered fields to read the columns afresh after an edit to a table. */
const refresh = StateEffect.define<null>();

/** The name of a component node, as written. */
function nameIn(text: string, node: SyntaxNode): string {
  const name = childOf(node, NODE.ComponentName);
  return name ? text.slice(name.from, name.to) : "";
}

/**
 * Every table in a document, with its columns and rows.
 *
 * @param text - The whole document.
 */
export function tablesIn(text: string): Table[] {
  const tables: Table[] = [];
  parseContent(text).iterate({
    enter(cursor) {
      if (cursor.name !== NODE.Component) return true;
      const node = cursor.node;
      const definition = definitionOf(nameIn(text, node));
      if (!definition?.holds) return true;

      const table: Table = { from: node.from, to: node.to, columns: [], rows: [] };
      const body = childOf(node, NODE.ComponentBody);
      for (let part = body?.firstChild ?? null; part; part = part.nextSibling) {
        if (part.name !== NODE.Component) continue;
        const partDefinition = definitionOf(nameIn(text, part));
        if (!partDefinition || !definition.holds.includes(nameIn(text, part))) continue;
        if (partDefinition.fields) {
          const row = rowOf(text, part);
          if (row) table.rows.push(row);
        } else {
          // One character into the name rather than its first: a deletion that
          // starts exactly where the column starts leaves its first position
          // standing, and it would then be taken for the column that follows.
          table.columns.push({ at: part.from + 1, field: columnField(text, part, partDefinition) });
        }
      }
      tables.push(table);
      return true;
    },
  });
  return tables;
}

/** The field a column shows, where it names one in the form a field takes. */
function columnField(text: string, node: SyntaxNode, definition: ComponentDefinition): string | null {
  for (const argument of argumentsOf(node)) {
    const name = childOf(argument, NODE.ArgumentName);
    const value = writtenValueOf(argument);
    if (!name || !value || definition.parameters[text.slice(name.from, name.to)]?.kind !== "field") continue;
    return writtenKindOf(value) === "keyword" ? text.slice(value.from, value.to) : null;
  }
  return null;
}

/** A row's named arguments and the bounds of its argument list. */
function rowOf(text: string, node: SyntaxNode): Row | null {
  const list = childOf(node, NODE.ComponentArguments);
  if (!list) return null;
  const rowArguments = argumentsOf(node).flatMap((argument) => {
    const name = childOf(argument, NODE.ArgumentName);
    return name
      ? [
          {
            name: text.slice(name.from, name.to),
            from: argument.from,
            to: argument.to,
            nameFrom: name.from,
            nameTo: name.to,
          },
        ]
      : [];
  });
  return { arguments: rowArguments, open: list.from + 1, close: list.to - 1 };
}

/** The columns' fields as they are remembered for a document. */
function rememberedIn(tables: readonly Table[]): Remembered[] {
  return tables.flatMap((table) =>
    table.columns.flatMap((column) => (column.field ? [{ at: column.at, field: column.field }] : [])),
  );
}

/**
 * A remembered column, carried through an edit: where it stands now, or null
 * where the edit deleted it, and where its text was, which places a deleted
 * column in the table it belonged to.
 */
export type Before = { field: string; at: number | null; near: number };

/**
 * What every row has to change for its table's columns, after an edit.
 *
 * @param tables - The tables as the edit left them.
 * @param before - Each column's remembered field, carried through the edit.
 * @returns The changes, at positions in the document the edit left.
 */
export function rowChanges(tables: readonly Table[], before: readonly Before[]): ChangeSpec[] {
  const changes: ChangeSpec[] = [];

  for (const table of tables) {
    const shown = new Set(table.columns.flatMap((column) => (column.field ? [column.field] : [])));
    const added: { field: string; after: string | null }[] = [];
    const renamed = new Map<string, string>();
    const removed = new Set<string>();

    table.columns.forEach((column, index) => {
      if (!column.field) return;
      const previous = before.find((entry) => entry.at === column.at);
      if (!previous) added.push({ field: column.field, after: fieldBefore(table.columns, index) });
      else if (previous.field !== column.field && !shown.has(previous.field))
        renamed.set(previous.field, column.field);
    });

    // A deleted column has no position of its own any more, so it is placed by
    // where its text was, which is inside the table it belonged to.
    for (const entry of before) {
      if (entry.at !== null || entry.near < table.from || entry.near > table.to) continue;
      if (!shown.has(entry.field)) removed.add(entry.field);
    }

    for (const row of table.rows) {
      const has = new Set(row.arguments.map((argument) => argument.name));
      const missing = [...added];
      for (const [from, to] of renamed) {
        const argument = row.arguments.find((candidate) => candidate.name === from);
        if (has.has(to)) continue;
        if (argument) changes.push({ from: argument.nameFrom, to: argument.nameTo, insert: to });
        else missing.push({ field: to, after: null });
      }
      for (const field of removed) if (has.has(field)) changes.push(removal(row, field));
      for (const { field, after } of missing) if (!has.has(field)) changes.push(insertion(row, field, after));
    }
  }
  return changes;
}

/** The field the column before this one shows, where there is one. */
function fieldBefore(columns: readonly Column[], index: number): string | null {
  for (let at = index - 1; at >= 0; at -= 1) {
    const field = columns[at]?.field;
    if (field) return field;
  }
  return null;
}

/**
 * Adds a field to a row, after the field of the column before it where the row
 * has that one, and first otherwise.
 */
function insertion(row: Row, field: string, after: string | null): ChangeSpec {
  const text = `${field}: ""`;
  const anchor = after ? row.arguments.find((argument) => argument.name === after) : undefined;
  if (anchor) return { from: anchor.to, insert: `, ${text}` };
  const first = row.arguments[0];
  if (first) return { from: first.from, insert: `${text}, ` };
  return { from: row.open, to: row.close, insert: text };
}

/** Takes a field out of a row, with the comma that joined it to its neighbour. */
function removal(row: Row, field: string): ChangeSpec {
  const index = row.arguments.findIndex((argument) => argument.name === field);
  const argument = row.arguments[index];
  const next = row.arguments[index + 1];
  const previous = row.arguments[index - 1];
  if (!argument) return [];
  if (next) return { from: argument.from, to: next.from };
  if (previous) return { from: previous.to, to: argument.to };
  return { from: argument.from, to: argument.to };
}

/**
 * Each column's last valid field, by position.
 *
 * Mapped through every change, and read afresh from the document after an edit
 * to a table. A column that names no valid field for the moment keeps what it
 * last showed, which is what lets a rename survive being typed.
 */
const rememberedFields = StateField.define<Remembered[]>({
  create: (state) => rememberedIn(tablesIn(state.doc.toString())),
  update(value, transaction) {
    const mapped = value.flatMap((entry) => {
      const at = transaction.changes.mapPos(entry.at, 1, MapMode.TrackDel);
      return at === null ? [] : [{ at, field: entry.field }];
    });
    if (!transaction.effects.some((effect) => effect.is(refresh))) return mapped;

    const current = rememberedIn(tablesIn(transaction.newDoc.toString()));
    const kept = mapped.filter((entry) => !current.some((fresh) => fresh.at === entry.at));
    return [...current, ...kept].sort((one, other) => one.at - other.at);
  },
});

/**
 * Whether an edit can concern a table: it touches one, or brings a column in.
 *
 * Asked before anything is parsed, because most keystrokes are prose and a
 * whole parse for each of them would be work spent on nothing.
 */
function touchesTable(transaction: Transaction): boolean {
  const tree = syntaxTree(transaction.startState);
  let touches = false;
  transaction.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    if (touches) return;
    if (/[A-Z][A-Za-z]*\(/.test(inserted.toString())) touches = true;
    for (const at of [fromA, toA]) {
      for (let node: SyntaxNode | null = tree.resolveInner(at, 0); node; node = node.parent) {
        if (node.name !== NODE.Component) continue;
        const name = childOf(node, NODE.ComponentName);
        if (name && definitionOf(transaction.startState.sliceDoc(name.from, name.to))?.holds) touches = true;
      }
    }
  });
  return touches;
}

/** The filter that adds the rows' changes to the edit that called for them. */
const syncFilter = EditorState.transactionFilter.of(
  (transaction): Transaction | readonly TransactionSpec[] => {
    if (!transaction.docChanged || !touchesTable(transaction)) return transaction;

    const tables = tablesIn(transaction.newDoc.toString());
    const before = transaction.startState.field(rememberedFields).map(
      (entry): Before => ({
        field: entry.field,
        at: transaction.changes.mapPos(entry.at, 1, MapMode.TrackDel),
        near: transaction.changes.mapPos(entry.at, 1),
      }),
    );
    const changes = rowChanges(tables, before);
    return [transaction, { changes, sequential: true, effects: refresh.of(null) }];
  },
);

/** The sync, as one extension for the surface. */
export function tableSync(): Extension {
  return [rememberedFields, syncFilter];
}
