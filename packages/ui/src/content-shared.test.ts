import { DEFAULT_FOCAL_POINT } from "@layered/schemas";
import { describe, expect, it } from "vitest";
import { imagePosition } from "./content-shared.js";

describe("a picture's crop", () => {
  // The package keeps its own default, because importing the schemas at runtime
  // would put zod into every island the site ships. This holds the two together.
  it("centres a picture without a focal point where the library's default does", () => {
    expect(imagePosition({})).toBe(`${DEFAULT_FOCAL_POINT.x * 100}% ${DEFAULT_FOCAL_POINT.y * 100}%`);
  });

  it("follows a picture's own focal point", () => {
    expect(imagePosition({ focalPoint: { x: 0.25, y: 0.8 } })).toBe("25% 80%");
  });
});
