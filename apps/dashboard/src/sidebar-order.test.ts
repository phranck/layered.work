import { describe, expect, it } from "vitest";
import { dropIndex, type GroupBox, moveItem, orderGroups, readOrder } from "./sidebar-order.js";

const groups = [{ id: "content" }, { id: "landing" }, { id: "structure" }, { id: "system" }];
const ids = (list: { id: string }[]) => list.map((group) => group.id);

describe("the stored order of the sidebar's groups", () => {
  it("comes back in the order it was left in", () => {
    expect(ids(orderGroups(groups, readOrder('["system","content","structure","landing"]')))).toEqual([
      "system",
      "content",
      "structure",
      "landing",
    ]);
  });

  it("drops a group that no longer exists and appends one that is new", () => {
    expect(ids(orderGroups(groups, readOrder('["structure","retired","content"]')))).toEqual([
      "structure",
      "content",
      "landing",
      "system",
    ]);
  });

  it("falls back to the declared order when nothing usable was stored", () => {
    for (const stored of [null, "", "not json", '{"content":1}', "[1,2]"]) {
      expect(ids(orderGroups(groups, readOrder(stored)))).toEqual(ids(groups));
    }
  });
});

describe("moving a group", () => {
  it("takes it out of its place and puts it at the new index", () => {
    expect(moveItem(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
  });
});

describe("where a dragged group lands", () => {
  // Three groups of 100 pixels with 20 between them: middles at 50, 170, 290.
  const boxes: GroupBox[] = [
    { top: 0, height: 100 },
    { top: 120, height: 100 },
    { top: 240, height: 100 },
  ];

  it("stays put at the first pixel of travel", () => {
    expect(dropIndex(boxes, 1, -1)).toBe(1);
    expect(dropIndex(boxes, 1, 1)).toBe(1);
  });

  it("does not move upwards until half the neighbour is covered", () => {
    // The dragged middle starts at 170 and has to pass the neighbour's at 50.
    expect(dropIndex(boxes, 1, -119)).toBe(1);
    expect(dropIndex(boxes, 1, -121)).toBe(0);
  });

  it("does not move downwards until half the neighbour is covered", () => {
    expect(dropIndex(boxes, 1, 119)).toBe(1);
    expect(dropIndex(boxes, 1, 121)).toBe(2);
  });

  it("can pass several groups in one drag and stops at the ends", () => {
    expect(dropIndex(boxes, 0, 500)).toBe(2);
    expect(dropIndex(boxes, 2, -500)).toBe(0);
  });
});
