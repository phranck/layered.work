import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { sameValue, useStoredRevision } from "./stored-draft.js";

describe("whether a draft says what is stored", () => {
  it("reads two values with the same pairs in another order as the same", () => {
    expect(
      sameValue({ title: { en: "A", de: "B" }, size: 3 }, { size: 3, title: { de: "B", en: "A" } }),
    ).toBe(true);
  });

  it("reads a changed text, a missing key or a reordered list as a change", () => {
    expect(sameValue({ title: { en: "A", de: "B" } }, { title: { en: "A", de: "C" } })).toBe(false);
    expect(sameValue({ title: "A", note: null }, { title: "A" })).toBe(false);
    expect(sameValue(["one", "two"], ["two", "one"])).toBe(false);
    expect(sameValue([], {})).toBe(false);
  });
});

describe("the revision of a stored value", () => {
  it("stays whilst the same value comes back as another object, and goes up when it changes", () => {
    const { result, rerender } = renderHook(({ value }) => useStoredRevision(value), {
      initialProps: { value: { title: "A", size: 3 } as unknown },
    });
    expect(result.current).toBe(0);
    rerender({ value: { size: 3, title: "A" } });
    expect(result.current).toBe(0);
    rerender({ value: { size: 4, title: "A" } });
    expect(result.current).toBe(1);
  });
});
