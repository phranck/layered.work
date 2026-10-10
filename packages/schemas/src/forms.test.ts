import { describe, expect, it } from "vitest";
import { submittedValueText } from "./forms.js";

describe("a submitted value as text", () => {
  it("is the value itself, the choices joined with a comma, or nothing for a field left out", () => {
    expect(submittedValueText("Hello")).toBe("Hello");
    expect(submittedValueText(["light", "sound"])).toBe("light, sound");
    expect(submittedValueText([])).toBe("");
    expect(submittedValueText(undefined)).toBe("");
  });
});
