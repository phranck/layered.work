import type { CreateFormBody, FormFieldType } from "@layered/schemas";
import type { FieldPlace, FieldTarget } from "./forms-model.js";

/**
 * Where something dragged over the form builder's canvas lands, worked out from
 * the boxes the canvas measured when the drag began. Kept apart from the
 * component, so the rule is a function of numbers and can be tested without a
 * browser.
 */

/**
 * What is being dragged: a tile of the palette, a field of the form, or a whole
 * row by its grip.
 */
export type DragSource =
  | { kind: "palette"; type: FormFieldType }
  | { kind: "field"; place: FieldPlace }
  | { kind: "row"; row: number };

/** One edge to edge extent, in the coordinates the pointer is read in. */
export type Extent = { start: number; end: number };

/** A row of the canvas as it was measured. */
export interface RowBox {
  /** The row's grid, top to bottom. */
  top: number;
  bottom: number;
  /** Each field's left and right edge, in the row's order. */
  fields: readonly Extent[];
  /** How many of the row's columns no field takes. */
  free: number;
}

/** A point, in the coordinates the boxes were measured in. */
export type Point = { x: number; y: number };

/**
 * What a row's grip carries. A row of one field carries that field, so it can
 * be set beside another field as well as between rows; a row of several moves
 * as a whole.
 *
 * @param form - The form.
 * @param row - The row whose grip is pressed.
 */
export function gripSource(form: CreateFormBody, row: number): DragSource {
  return form.rows[row]?.fields.length === 1
    ? { kind: "field", place: { row, column: 0 } }
    : { kind: "row", row };
}

/** The fields of a row a drop counts, which leaves out the field being moved when it comes from that row. */
function countedFields(row: RowBox, index: number, source: DragSource): readonly Extent[] {
  return source.kind === "field" && source.place.row === index
    ? row.fields.filter((_, column) => column !== source.place.column)
    : row.fields;
}

/**
 * Where a tile or a field dropped at a point goes.
 *
 * Within a row's height: into that row, between the fields the point falls
 * between, when the row is the dragged field's own or has a free column; over
 * a full row, into a new row above or below it, by the half the point is in.
 * Above, between or below the rows: into a new row there.
 *
 * @param rows - The canvas's rows, top to bottom, as measured when the drag began.
 * @param point - Where the pointer is.
 * @param source - What is dragged, a tile or a field.
 */
export function dropTarget(rows: readonly RowBox[], point: Point, source: DragSource): FieldTarget {
  for (const [index, row] of rows.entries()) {
    if (point.y < row.top) return { kind: "new-row", row: index };
    if (point.y > row.bottom) continue;
    const own = source.kind === "field" && source.place.row === index;
    if (own || row.free >= 1) {
      const column = countedFields(row, index, source).filter(
        (field) => (field.start + field.end) / 2 < point.x,
      ).length;
      return { kind: "row", row: index, column };
    }
    return { kind: "new-row", row: point.y < (row.top + row.bottom) / 2 ? index : index + 1 };
  }
  return { kind: "new-row", row: rows.length };
}

/**
 * The position a whole row dropped at a point takes among the rows, counted
 * with the row itself taken out: it goes after every other row whose middle the
 * point is below.
 *
 * @param rows - The canvas's rows, top to bottom, as measured when the drag began.
 * @param point - Where the pointer is.
 * @param from - The dragged row's position.
 */
export function rowDropIndex(rows: readonly RowBox[], point: Point, from: number): number {
  return rows.filter((row, index) => index !== from && (row.top + row.bottom) / 2 < point.y).length;
}
