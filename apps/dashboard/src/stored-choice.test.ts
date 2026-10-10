import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { restoredStep, storedChoiceKey, useStoredChoice } from "./stored-choice.js";

const KEY = storedChoiceKey("test-choice");
const STEPS = ["s", "m", "l"] as const;
const restore = (stored: string | null) => restoredStep(STEPS, stored, "m");

afterEach(() => {
  window.localStorage.removeItem(KEY);
});

describe("a choice the browser keeps", () => {
  it("starts on what was kept, and keeps a change for the next visit", () => {
    window.localStorage.setItem(KEY, "l");
    const apply = vi.fn();
    const { result } = renderHook(() => useStoredChoice(KEY, restore, apply));
    expect(result.current[0]).toBe("l");

    act(() => result.current[1]("s"));

    expect(result.current[0]).toBe("s");
    expect(apply).toHaveBeenCalledWith("s");
    expect(window.localStorage.getItem(KEY)).toBe("s");
  });
});
