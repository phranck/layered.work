import { describe, expect, it } from "vitest";
import { type DragSource, dropTarget, type Gaps, markerFor, type RowBox } from "./forms-drag.js";

/** The space between two fields of a row and between two rows of the canvas below. */
const GAPS: Gaps = { column: 10, row: 6 };

/**
 * A canvas of two rows, each with 7 of padding around its grid and 6 between
 * them: a full one of two fields at half width each, and one with a single
 * field across a third of its width and eight columns free.
 */
const ROWS: RowBox[] = [
  {
    top: 0,
    bottom: 40,
    left: 0,
    right: 600,
    outerTop: -7,
    outerBottom: 47,
    fields: [
      { start: 0, end: 295 },
      { start: 305, end: 600 },
    ],
    free: 0,
  },
  {
    top: 60,
    bottom: 100,
    left: 0,
    right: 600,
    outerTop: 53,
    outerBottom: 107,
    fields: [{ start: 0, end: 195 }],
    free: 8,
  },
];

const TILE: DragSource = { kind: "palette", type: "email" };

describe("form builder drop", () => {
  it("goes into a new row above, between and below the rows", () => {
    expect(dropTarget(ROWS, { x: 100, y: -5 }, TILE)).toEqual({ kind: "new-row", row: 0 });
    expect(dropTarget(ROWS, { x: 100, y: 50 }, TILE)).toEqual({ kind: "new-row", row: 1 });
    expect(dropTarget(ROWS, { x: 100, y: 200 }, TILE)).toEqual({ kind: "new-row", row: 2 });
  });

  it("goes into a row with a free column, between the fields the point falls between", () => {
    expect(dropTarget(ROWS, { x: 50, y: 80 }, TILE)).toEqual({ kind: "row", row: 1, column: 0 });
    expect(dropTarget(ROWS, { x: 400, y: 80 }, TILE)).toEqual({ kind: "row", row: 1, column: 1 });
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

  it("draws an upright line in the gap beside a field", () => {
    expect(markerFor(ROWS, { kind: "row", row: 1, column: 1 }, TILE, GAPS, 2)).toEqual({
      left: 199,
      top: 60,
      width: 2,
      height: 40,
    });
  });

  it("draws a line across in the middle of the gap between two rows' own boxes", () => {
    expect(markerFor(ROWS, { kind: "new-row", row: 1 }, TILE, GAPS, 2)).toEqual({
      left: 0,
      top: 49,
      width: 600,
      height: 2,
    });
    expect(markerFor(ROWS, { kind: "new-row", row: 0 }, TILE, GAPS, 2)?.top).toBe(-11);
    expect(markerFor(ROWS, { kind: "new-row", row: 2 }, TILE, GAPS, 2)?.top).toBe(109);
    expect(markerFor([], { kind: "new-row", row: 0 }, TILE, GAPS, 2)).toBeUndefined();
  });
});
