import { describe, expect, it } from "vitest";
import { restoredTextSize, steppedTextSize } from "./editor-text-size.js";

describe("stepping the text size of the writing surface", () => {
  it("moves one step and stops at either end", () => {
    expect(steppedTextSize("s", 1)).toBe("m");
    expect(steppedTextSize("m", -1)).toBe("s");
    expect(steppedTextSize("s", -1)).toBe("s");
    expect(steppedTextSize("xl", 1)).toBe("xl");
  });
});

describe("the stored text size of the writing surface", () => {
  it("is the step that was stored", () => {
    expect(restoredTextSize("l")).toBe("l");
  });

  it("is the code size where nothing or something unknown was stored", () => {
    expect(restoredTextSize(null)).toBe("s");
    expect(restoredTextSize("huge")).toBe("s");
    expect(restoredTextSize("")).toBe("s");
  });
});
