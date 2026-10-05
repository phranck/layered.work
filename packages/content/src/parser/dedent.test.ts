import { describe, expect, it } from "vitest";
import { bodyIndent, dedent } from "./dedent.js";

describe("how far a body is indented", () => {
  it("is the indentation of its first line with text on it", () => {
    expect(bodyIndent("\n\n    ## Heading\n  less\n      more")).toBe(4);
  });

  it("counts the opener's own line when the text starts there", () => {
    expect(bodyIndent(" Das Image braucht eine Karte. ")).toBe(1);
  });

  it("is zero for a body with no text in it", () => {
    expect(bodyIndent("")).toBe(0);
    expect(bodyIndent("\n   \n")).toBe(0);
  });

  it("is what dedent takes off every line, and never more than a line has", () => {
    const body = "\n    first\n  less\n      deeper";
    expect(dedent(body, 0).text).toBe("\nfirst\nless\n  deeper");
  });
});
