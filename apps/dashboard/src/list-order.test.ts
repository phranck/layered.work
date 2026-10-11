import { describe, expect, it } from "vitest";
import { nextSortOrder, reorderedPositions } from "./list-order.js";

describe("the positions a reorder stores", () => {
  it("number every item from zero in the order after the move", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(reorderedPositions(items, 2, 0)).toEqual([
      { id: "c", sortOrder: 0 },
      { id: "a", sortOrder: 1 },
      { id: "b", sortOrder: 2 },
    ]);
  });
});

describe("the place a new item takes", () => {
  it("comes after the highest place, however the places are spread", () => {
    expect(nextSortOrder([{ sortOrder: 4 }, { sortOrder: 1 }])).toBe(5);
  });

  it("is the first place in an empty list", () => {
    expect(nextSortOrder([])).toBe(0);
  });
});
