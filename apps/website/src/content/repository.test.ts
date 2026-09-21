import { describe, expect, it } from "vitest";
import { createRepository, parseListingQuery, summaryOf } from "./repository.js";

const entry = (id: number, visibility = "public", language = "en") => ({
  id,
  title: `Entry ${id}`,
  slug: `entry-${id}`,
  path: `/${language === "de" ? "de/" : ""}entry-${id}/`,
  language,
  visibility,
  kind: "post",
  publishedAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  summary: "",
  body: "First **complete** paragraph.\n\nSecond paragraph.",
  topics: ["hardware"],
});
/** A hash shaped like a stored one. Nothing here ever verifies a password. */
const PASSWORD_HASH = "scrypt$32768$8$1$c2FsdA$aGFzaA";
const snapshot = {
  entries: [
    entry(1),
    entry(2, "hidden"),
    entry(3, "draft"),
    entry(4, "trashed"),
    { ...entry(5, "protected"), passwordHash: PASSWORD_HASH },
    entry(6, "public", "de"),
  ],
  topics: [{ id: 1, slug: "hardware", name: "Hardware" }],
  media: [],
  redirects: [{ source: "/old/", target: "/entry-1/" }],
};

describe("public content repository", () => {
  it("honors enabled home blocks and their configured order", () => {
    const repo = createRepository({
      ...snapshot,
      homeBlocks: [
        { type: "posts", enabled: true, sortOrder: 2 },
        { type: "hero", enabled: true, sortOrder: 1 },
        { type: "projects", enabled: false, sortOrder: 0 },
      ],
    });
    expect(repo.blocks().map((block) => block.type)).toEqual(["hero", "posts"]);
  });
  it("excludes non-public states and other languages from every collection", () => {
    const repo = createRepository(snapshot);
    expect(repo.list({ language: "en" }).entries.map((item) => item.id)).toEqual([1]);
    expect(repo.list({ language: "en", query: "Entry 2" }).total).toBe(0);
    const published = repo.entry("/entry-1/");
    if (!published) throw new Error("Public fixture entry missing");
    expect(repo.related(published).map((item) => item.id)).toEqual([]);
  });
  it("serves hidden only by known address, refuses draft, trashed and protected bodies", () => {
    const repo = createRepository(snapshot);
    expect(repo.entry("/entry-2/")?.visibility).toBe("hidden");
    for (const id of [3, 4, 5]) expect(repo.entry(`/entry-${id}/`)).toBeUndefined();
  });
  it("hands a protected entry over only with the hash that guards it", () => {
    const repo = createRepository(snapshot);
    expect(repo.protectedEntry("/entry-5/")?.passwordHash).toBe(PASSWORD_HASH);
    // Everything else is not a protected entry, whatever else it is.
    for (const path of ["/entry-1/", "/entry-2/", "/entry-3/", "/entry-4/", "/nothing-here/"]) {
      expect(repo.protectedEntry(path)).toBeUndefined();
    }
  });
  it("refuses a snapshot where protection and password disagree", () => {
    expect(() => createRepository({ ...snapshot, entries: [entry(7, "protected")] })).toThrow(
      /password hash/,
    );
    expect(() =>
      createRepository({ ...snapshot, entries: [{ ...entry(8), passwordHash: PASSWORD_HASH }] }),
    ).toThrow(/password hash/);
  });
  it("resolves only local redirects and rejects duplicate public addresses", () => {
    expect(createRepository(snapshot).redirect("/old/")).toBe("/entry-1/");
    expect(() =>
      createRepository({ ...snapshot, redirects: [{ source: "/old/", target: "//evil.test/" }] }),
    ).toThrow();
    expect(() => createRepository({ ...snapshot, entries: [entry(1), entry(1)] })).toThrow();
  });
  it("paginates deterministically without client-side state", () => {
    const repo = createRepository({
      ...snapshot,
      entries: Array.from({ length: 15 }, (_, i) => entry(i + 1)),
    });
    expect(repo.list({ language: "en", page: 2 }).entries).toHaveLength(3);
    expect(repo.list({ language: "en", page: 3 }).entries).toEqual([]);
  });
  it("carries an entry's own specification pairs, and refuses empty or unbounded ones", () => {
    const withSpecs = (specs: unknown) => ({
      ...snapshot,
      entries: [{ ...entry(1), kind: "project", specs }],
    });
    const repo = createRepository(
      withSpecs([
        { label: "Status", value: "In progress" },
        { label: "Material", value: "PETG" },
      ]),
    );
    expect(repo.entry("/entry-1/")?.specs).toEqual([
      { label: "Status", value: "In progress" },
      { label: "Material", value: "PETG" },
    ]);
    expect(createRepository({ ...snapshot }).entry("/entry-1/")?.specs).toEqual([]);
    expect(() => createRepository(withSpecs([{ label: "", value: "x" }]))).toThrow();
    expect(() =>
      createRepository(withSpecs(Array.from({ length: 9 }, () => ({ label: "a", value: "b" })))),
    ).toThrow();
  });
  it("keeps component syntax out of a summary, wherever it sits", () => {
    const repo = createRepository({
      ...snapshot,
      entries: [
        {
          ...entry(1),
          summary: "",
          body: 'A sentence. Model("thing", alt: "A thing") And another.\n\nSecond paragraph.',
        },
      ],
    });
    const summary = summaryOf(repo.entry("/entry-1/") as never);
    expect(summary).toBe("A sentence. And another.");
    expect(summary).not.toContain("Model(");
  });
  it("offers other entries of the same kind, newest first, without the one being read", () => {
    const repo = createRepository({
      ...snapshot,
      entries: [
        { ...entry(1), kind: "project", publishedAt: "2026-03-01T00:00:00Z" },
        { ...entry(2), kind: "project", publishedAt: "2026-02-01T00:00:00Z" },
        { ...entry(3), kind: "project", publishedAt: "2026-01-01T00:00:00Z" },
        entry(4),
        { ...entry(5), kind: "project", visibility: "draft" },
      ],
    });
    const current = repo.entry("/entry-1/");
    if (!current) throw new Error("Public fixture entry missing");
    expect(repo.otherEntries(current, 2).map((item) => item.id)).toEqual([2, 3]);
    expect(repo.otherEntries(current).every((item) => item.kind === "project")).toBe(true);
  });
  it("indexes public entries of one language, with the text the listing searches", () => {
    const repo = createRepository(snapshot);
    const index = repo.searchIndex("en");
    expect(index.map((item) => item.path)).toEqual(["/entry-1/"]);
    expect(index[0]).toMatchObject({ title: "Entry 1", kind: "post" });
    expect(index[0]?.text).toContain("second paragraph");
    expect(index[0]?.text).toContain("hardware");
    expect(repo.searchIndex("de").map((item) => item.path)).toEqual(["/de/entry-6/"]);
  });
  it("finds a topic by its name in both the listing and the index", () => {
    const repo = createRepository(snapshot);
    expect(repo.list({ language: "en", query: "Hardware" }).total).toBe(1);
    expect(repo.searchIndex("en")[0]?.text).toContain("hardware");
  });
  it("bounds request values before searching or rendering them", () => {
    expect(parseListingQuery(new URLSearchParams("page=2&q=hardware"))).toEqual({
      page: 2,
      query: "hardware",
    });
    for (const value of ["page=-1", "page=1.5", "page=999999", `q=${"a".repeat(121)}`, "q=%00"])
      expect(() => parseListingQuery(new URLSearchParams(value))).toThrow();
  });
});
