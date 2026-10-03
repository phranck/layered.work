import { describe, expect, it } from "vitest";
import { containing } from "./like.js";

describe("a LIKE pattern for a search", () => {
  it("wraps the text so it matches anywhere", () => {
    expect(containing("pi")).toBe("%pi%");
  });

  it("takes wildcards and the escape character literally", () => {
    expect(containing("100%_a\\b")).toBe("%100\\%\\_a\\\\b%");
  });
});
