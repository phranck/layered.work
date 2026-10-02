import { describe, expect, it } from "vitest";
import { compare, type Source, stateOf, type Target } from "./verify-migration.js";

/**
 * The comparison is only worth something if it notices a difference, so every
 * case here starts from two sides that agree and breaks one thing.
 */

function agreeing(): { source: Source; target: Target } {
  return {
    source: {
      posts: [
        {
          slug: "first",
          title: "First",
          state: "public",
          createdAt: "2025-01-01T00:00:00.000Z",
          topics: ["a"],
        },
        {
          slug: "erste",
          title: "Erste",
          state: "hidden",
          createdAt: "2025-01-02T00:00:00.000Z",
          topics: ["a"],
        },
        { slug: "later", title: "Later", state: "draft", createdAt: "2025-01-03T00:00:00.000Z", topics: [] },
        {
          slug: "binned",
          title: "Binned",
          state: "trashed",
          createdAt: "2025-01-04T00:00:00.000Z",
          topics: [],
        },
      ],
      topics: ["a"],
      files: [
        { path: "posts/1/one.jpg", sha256: "one", named: true, copy: false },
        { path: "posts/2/one.jpg", sha256: "one", named: false, copy: false },
      ],
    },
    target: {
      translations: [
        {
          entryId: "pair",
          slug: "first",
          path: "/first/",
          title: "First",
          state: "public",
          publishedAt: "2025-01-01T00:00:00.000Z",
        },
        {
          entryId: "pair",
          slug: "erste",
          path: "/de/erste/",
          title: "Erste",
          state: "hidden",
          publishedAt: "2025-01-02T00:00:00.000Z",
        },
        {
          entryId: "draft",
          slug: "later",
          path: "/later/",
          title: "Later",
          state: "draft",
          publishedAt: "2025-01-03T00:00:00.000Z",
        },
      ],
      topics: ["a"],
      topicsByEntry: new Map([["pair", ["a"]]]),
      checksums: new Set(["one"]),
    },
  };
}

describe("reading a Publii status", () => {
  it("lets the bin win, then a draft, then hidden", () => {
    expect(stateOf("published,is-page,trashed")).toBe("trashed");
    expect(stateOf("draft,is-page")).toBe("draft");
    expect(stateOf("published,hidden,excluded_homepage")).toBe("hidden");
    expect(stateOf("published,featured")).toBe("public");
    expect(stateOf("")).toBe("draft");
  });
});

describe("comparing Publii with the database", () => {
  it("passes when both sides agree", () => {
    const { source, target } = agreeing();
    const result = compare(source, target);

    expect(result.passed).toBe(true);
    // A pair sharing a topic is one assignment, not two.
    expect(result.counts.find((row) => row.what === "Topic assignments")?.target).toBe(1);
  });

  it("notices a draft that did not arrive", () => {
    const { source, target } = agreeing();
    target.translations = target.translations.filter((row) => row.slug !== "later");

    const result = compare(source, target);
    expect(result.passed).toBe(false);
    expect(result.entries.find((row) => row.slug === "later")?.problems).toEqual(["missing"]);
  });

  it("notices a changed title, date and state", () => {
    const { source, target } = agreeing();
    const [first] = target.translations;
    if (!first) throw new Error("fixture");
    Object.assign(first, { title: "Firts", publishedAt: "2025-01-05T00:00:00.000Z", state: "hidden" });

    const problems = compare(source, target).entries.find((row) => row.slug === "first")?.problems;
    expect(problems).toHaveLength(3);
  });

  it("notices a lost topic", () => {
    const { source, target } = agreeing();
    target.topicsByEntry = new Map();

    expect(compare(source, target).passed).toBe(false);
  });

  it("notices an entry from the bin that arrived", () => {
    const { source, target } = agreeing();
    target.translations.push({
      entryId: "bin",
      slug: "binned",
      path: "/binned/",
      title: "Binned",
      state: "public",
      publishedAt: null,
    });

    expect(compare(source, target).passed).toBe(false);
  });

  it("does not fail on an absent size copy, though Publii's body names it", () => {
    const { source, target } = agreeing();
    source.files.push({ path: "posts/1/responsive/one-md.webp", sha256: "copy", named: true, copy: true });

    const result = compare(source, target);
    expect(result.passed).toBe(true);
    expect(result.absentFiles.map((file) => file.path)).toEqual(["posts/1/responsive/one-md.webp"]);
  });

  it("fails on an absent file a post names, and not on one nobody names", () => {
    const { source, target } = agreeing();
    source.files.push({ path: "plugins/map.svg", sha256: "unnamed", named: false, copy: false });
    expect(compare(source, target).passed).toBe(true);

    target.checksums = new Set();
    const result = compare(source, target);
    expect(result.passed).toBe(false);
    expect(result.absentFiles.map((file) => file.path)).toContain("posts/1/one.jpg");
  });
});
