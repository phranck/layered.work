import type { TopicListItem } from "@layered/schemas";
import { describe, expect, it } from "vitest";
import { type DraftItem, newNavigationItem, targetOptions, withoutItem } from "./navigation-query.js";

function item(overrides: Partial<DraftItem>): DraftItem {
  return { ...newNavigationItem(), ...overrides };
}

describe("removing a link from a group", () => {
  it("moves the links under it up to the top level", () => {
    const parent = item({ id: "parent", key: "parent" });
    const child = item({ id: "child", key: "child", parentId: "parent" });
    const other = item({ id: "other", key: "other" });
    const left = withoutItem([parent, child, other], parent);
    expect(left.map((link) => [link.id, link.parentId])).toEqual([
      ["child", null],
      ["other", null],
    ]);
  });
});

describe("the targets a link is offered", () => {
  const topic: TopicListItem = {
    id: "topic-1",
    en: null,
    de: { name: "Elektronik", slug: "elektronik" },
    entryCount: 0,
  };

  it("names a topic in another language where it has no name in the one asked for", () => {
    expect(targetOptions("topic", undefined, [topic], "en", "", "broken")).toEqual([
      { value: "topic-1", label: "Elektronik" },
    ]);
  });

  it("keeps a target that is gone, under the word for a broken link", () => {
    expect(targetOptions("topic", undefined, [topic], "en", "gone", "broken")).toContainEqual({
      value: "gone",
      label: "broken",
    });
  });
});
