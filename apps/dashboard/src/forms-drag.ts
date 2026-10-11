import type { FormFieldType } from "@layered/schemas";
import type { FieldPlace, FieldTarget } from "./forms-model.js";

/**
 * Where a field dragged over the form builder's canvas lands, worked out from
 * the boxes the canvas measured. Kept apart from the component, so the rule is
 * a function of numbers and can be tested without a browser.
 */

/** What is being dragged: a tile of the palette, or a field of the form. */
export type DragSource = { kind: "palette"; type: FormFieldType } | { kind: "field"; place: FieldPlace };

/** One edge to edge extent, in the coordinates the pointer is read in. */
export type Extent = { start: number; end: number };

/** A row of the canvas as it was measured. */
export interface RowBox {
  /** The row's grid, top to bottom. */
  top: number;
  bottom: number;
  /** The row's grid, left to right. */
  left: number;
  right: number;
  /** The row's own box, grip and padding included, top to bottom. */
  outerTop: number;
  outerBottom: number;
  /** Each field's left and right edge, in the row's order. */
  fields: readonly Extent[];
  /** How many of the row's columns no field takes. */
  free: number;
}

/** A point, in the coordinates the boxes were measured in. */
export type Point = { x: number; y: number };

/** The fields of a row a drop counts, which leaves out the field being moved when it comes from that row. */
function countedFields(row: RowBox, index: number, source: DragSource): readonly Extent[] {
  return source.kind === "field" && source.place.row === index
    ? row.fields.filter((_, column) => column !== source.place.column)
    : row.fields;
}

/**
 * Where a drop at a point goes.
 *
 * Within a row's height: into that row, between the fields the point falls
 * between, when the row is the dragged field's own or has a free column; over
 * a full row, into a new row above or below it, by the half the point is in.
 * Above, between or below the rows: into a new row there.
 *
 * @param rows - The canvas's rows, top to bottom.
 * @param point - Where the pointer is.
 * @param source - What is dragged.
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

/** The line that shows where a drop lands, as a box in the measured coordinates. */
export type Marker = { left: number; top: number; width: number; height: number };

/** The space between two fields of a row, and between two rows. */
export type Gaps = { column: number; row: number };

/**
 * The line that shows where a target lands: upright in the gap between two
 * fields of a row, or across the canvas in the gap between two rows.
 *
 * @param rows - The canvas's rows, top to bottom.
 * @param target - Where the drop goes.
 * @param source - What is dragged.
 * @param gaps - The space between two fields and between two rows, which the line stands in the middle of.
 * @param thickness - How thick the line is drawn.
 */
export function markerFor(
  rows: readonly RowBox[],
  target: FieldTarget,
  source: DragSource,
  gaps: Gaps,
  thickness: number,
): Marker | undefined {
  if (target.kind === "row") {
    const row = rows[target.row];
    if (!row) return undefined;
    const fields = countedFields(row, target.row, source);
    const after = fields[target.column - 1];
    const before = fields[target.column];
    const x = before ? before.start - gaps.column / 2 : after ? after.end + gaps.column / 2 : row.left;
    return { left: x - thickness / 2, top: row.top, width: thickness, height: row.bottom - row.top };
  }
  const first = rows[0];
  if (!first) return undefined;
  const below = rows[target.row];
  const above = rows[target.row - 1];
  // The line stands in the space between the rows' own boxes, so it reads as
  // a place between them rather than as a place inside the row below.
  const y =
    above && below
      ? (above.outerBottom + below.outerTop) / 2
      : below
        ? below.outerTop - gaps.row / 2
        : above
          ? above.outerBottom + gaps.row / 2
          : first.outerTop;
  return { left: first.left, top: y - thickness / 2, width: first.right - first.left, height: thickness };
}
