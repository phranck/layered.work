import { describe, expect, it } from "vitest";
import { expirationLoginLocation, safeReturnTo } from "./auth-routing.js";

describe("safeReturnTo", () => {
  it("keeps internal dashboard paths with query and hash", () => {
    expect(safeReturnTo("/settings?tab=mail#smtp")).toBe("/settings?tab=mail#smtp");
  });

  it.each([
    null,
    "",
    "https://evil.example",
    "//evil.example/path",
    "javascript:alert(1)",
  ])("falls back to posts for %s", (value) => expect(safeReturnTo(value)).toBe("/posts"));

  it("never uses the login screen as a return target", () => {
    expect(safeReturnTo("/login?returnTo=%2Fsettings")).toBe("/posts");
    expect(
      expirationLoginLocation({
        pathname: "/login",
        search: "?returnTo=%2Fsettings&expired=1",
        hash: "",
      }),
    ).toBeNull();
  });
});
