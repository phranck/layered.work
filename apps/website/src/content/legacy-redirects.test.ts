import { describe, expect, it } from "vitest";
import { LEGACY_REDIRECT_TARGETS, LEGACY_REDIRECTS, legacyPostsPage } from "./legacy-redirects.js";

describe("the old home page's numbered pages", () => {
  it("land on the listing page that holds the posts they showed", () => {
    // Eight posts a page then, twelve by default now: the old second page began
    // with the ninth post, which is on the first page here.
    expect(legacyPostsPage(1, 12)).toBe(1);
    expect(legacyPostsPage(2, 12)).toBe(1);
    expect(legacyPostsPage(3, 12)).toBe(2);
    expect(legacyPostsPage(4, 12)).toBe(3);
  });

  it("follow the page size the posts overview is set to", () => {
    // Five a page: the old third page began with the seventeenth post, on the fourth page.
    expect(legacyPostsPage(3, 5)).toBe(4);
    expect(legacyPostsPage(2, 8)).toBe(2);
  });
});

describe("addresses the archive remembers", () => {
  it("states each source once, as a local path with its trailing slash", () => {
    for (const { source } of LEGACY_REDIRECTS) {
      expect(source.startsWith("/")).toBe(true);
      expect(source.startsWith("//")).toBe(false);
      expect(source.endsWith("/")).toBe(true);
    }
    expect(LEGACY_REDIRECT_TARGETS.size).toBe(LEGACY_REDIRECTS.length);
  });

  it("sends every source to a local path that is not itself redirected", () => {
    for (const { source, target } of LEGACY_REDIRECTS) {
      expect(target.startsWith("/")).toBe(true);
      expect(target.startsWith("//")).toBe(false);
      expect(target).not.toBe(source);
      // A target that is also a source would cost the visitor a second hop, and
      // a later edit could close the pair into a loop the route cannot escape.
      expect(LEGACY_REDIRECT_TARGETS.has(target)).toBe(false);
    }
  });

  it("records where each address was observed, so the table can be re-checked", () => {
    for (const { reason } of LEGACY_REDIRECTS) {
      expect(reason).toMatch(/Archived 200 on \d{1,2} \w+ \d{4}\./);
    }
  });
});
