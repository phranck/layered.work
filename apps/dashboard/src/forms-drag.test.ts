import type { CreateFormBody } from "@layered/schemas";
import { describe, expect, it } from "vitest";
import { type DragSource, dropTarget, gripSource, type RowBox, rowDropIndex } from "./forms-drag.js";
import { newField, newForm } from "./forms-model.js";

/**
 * A canvas of three rows, 20 apart: a full one of two fields at half width
 * each, one with a single field across half its width and six columns free,
 * and a full one of a single field.
 */
const ROWS: RowBox[] = [
  {
    top: 0,
    bottom: 40,
    fields: [
      { start: 0, end: 295 },
      { start: 305, end: 600 },
    ],
    free: 0,
  },
  { top: 60, bottom: 100, fields: [{ start: 0, end: 295 }], free: 6 },
  { top: 120, bottom: 160, fields: [{ start: 0, end: 600 }], free: 0 },
];

const TILE: DragSource = { kind: "palette", type: "email" };

/** A form whose rows hold two fields, one field and one field. */
function form(): CreateFormBody {
  return {
    ...newForm("Sample"),
    rows: [
      { fields: [newField("shortText", "first"), newField("shortText", "last")] },
      { fields: [newField("email", "email")] },
    ],
  };
}

describe("form builder drop", () => {
  it("goes into a new row above, between and below the rows", () => {
    expect(dropTarget(ROWS, { x: 100, y: -5 }, TILE)).toEqual({ kind: "new-row", row: 0 });
    expect(dropTarget(ROWS, { x: 100, y: 50 }, TILE)).toEqual({ kind: "new-row", row: 1 });
    expect(dropTarget(ROWS, { x: 100, y: 200 }, TILE)).toEqual({ kind: "new-row", row: 3 });
  });

  it("goes into a row with a free column, between the fields the point falls between", () => {
    expect(dropTarget(ROWS, { x: 50, y: 80 }, TILE)).toEqual({ kind: "row", row: 1, column: 0 });
    expect(dropTarget(ROWS, { x: 450, y: 80 }, TILE)).toEqual({ kind: "row", row: 1, column: 1 });
  });

  it("puts a field from its own full row beside the half-width field of another", () => {
    const alone: DragSource = { kind: "field", place: { row: 2, column: 0 } };
    expect(dropTarget(ROWS, { x: 450, y: 80 }, alone)).toEqual({ kind: "row", row: 1, column: 1 });
  });

  it("goes into a new row above or below a full row, by the half the point is in", () => {
    expect(dropTarget(ROWS, { x: 400, y: 10 }, TILE)).toEqual({ kind: "new-row", row: 0 });
    expect(dropTarget(ROWS, { x: 400, y: 30 }, TILE)).toEqual({ kind: "new-row", row: 1 });
  });

  it("lets a field move within its own full row, counting the row without it", () => {
    const own: DragSource = { kind: "field", place: { row: 0, column: 0 } };
    expect(dropTarget(ROWS, { x: 500, y: 20 }, own)).toEqual({ kind: "row", row: 0, column: 1 });
    expect(dropTarget(ROWS, { x: 200, y: 20 }, own)).toEqual({ kind: "row", row: 0, column: 0 });
  });
});

describe("form builder grip", () => {
  it("carries the field of a row that holds one, and the whole row of one that holds several", () => {
    expect(gripSource(form(), 1)).toEqual({ kind: "field", place: { row: 1, column: 0 } });
    expect(gripSource(form(), 0)).toEqual({ kind: "row", row: 0 });
  });

  it("puts a row after every other row whose middle the point is below", () => {
    expect(rowDropIndex(ROWS, { x: 0, y: 5 }, 0)).toBe(0);
    expect(rowDropIndex(ROWS, { x: 0, y: 90 }, 0)).toBe(1);
    expect(rowDropIndex(ROWS, { x: 0, y: 150 }, 0)).toBe(2);
    expect(rowDropIndex(ROWS, { x: 0, y: 5 }, 2)).toBe(0);
  });
});
