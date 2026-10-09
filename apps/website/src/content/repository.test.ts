import { DEFAULT_LISTING, homeBlockTypes } from "@layered/schemas";
import { describe, expect, it } from "vitest";
import { createRepository, parseListingQuery, summaryOf, topicPath } from "./repository.js";

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
  topics: ["1"],
});
const snapshot = {
  entries: [entry(1), entry(2, "hidden"), entry(3, "draft"), entry(4, "trashed"), entry(6, "public", "de")],
  topics: [{ id: "1", translations: { en: { slug: "hardware", name: "Hardware" }, de: null } }],
  media: [],
  redirects: [{ source: "/old/", target: "/entry-1/" }],
};

describe("public content repository", () => {
  it("keeps a picture from Unsplash on Unsplash's address and words its credit for each page", () => {
    const repo = createRepository({
      ...snapshot,
      media: [
        {
          slug: "workbench",
          src: "https://images.unsplash.com/photo-1?ixid=a&w=1180",
          srcSet: "https://images.unsplash.com/photo-1?ixid=a&w=348 348w",
          credit: { photographer: "Jane Doe", profileUrl: "https://unsplash.com/@janedoe" },
        },
      ],
    });
    const german = repo.media("workbench", "de");
    expect(german?.src).toBe("https://images.unsplash.com/photo-1?ixid=a&w=1180");
    expect(german?.srcSet).toBe("https://images.unsplash.com/photo-1?ixid=a&w=348 348w");
    expect(german?.credit).toEqual({
      lead: "Foto von",
      author: "Jane Doe",
      authorUrl: "https://unsplash.com/@janedoe?utm_source=layered_work&utm_medium=referral",
      joiner: "auf",
      source: "Unsplash",
      sourceUrl: "https://unsplash.com/?utm_source=layered_work&utm_medium=referral",
    });
    expect(repo.media("workbench", "en")?.credit?.lead).toBe("Photo by");
    expect(() =>
      createRepository({
        ...snapshot,
        media: [{ slug: "elsewhere", src: "https://evil.example/photo.jpg" }],
      }),
    ).toThrow();
  });
  it("keeps stored footer navigation separate for each language, including an intentionally empty footer", () => {
    const en = [
      { title: "First", items: [{ label: "One", href: "/posts/" }] },
      { title: "Second", items: [] },
    ];
    const de = [{ title: "Zuerst", items: [{ label: "Eins", href: "/de/posts/" }] }];
    const repo = createRepository({ ...snapshot, footerNavigation: { en, de } });
    expect(repo.footerNavigation("en")).toEqual(en);
    expect(repo.footerNavigation("de")).toEqual(de);
    expect(
      createRepository({ ...snapshot, footerNavigation: { en: [], de: [] } }).footerNavigation("en"),
    ).toEqual([]);
    expect(createRepository(snapshot).footerNavigation("en")).toBeUndefined();
  });
  it("honors enabled home blocks and their configured order", () => {
    const repo = createRepository({
      ...snapshot,
      homeBlocks: [
        { type: "post_grid", enabled: true, sortOrder: 2 },
        { type: "hero", enabled: true, sortOrder: 1 },
        { type: "project_grid", enabled: false, sortOrder: 0 },
      ],
    });
    expect(repo.blocks().map((block) => block.type)).toEqual(["hero", "post_grid"]);
    expect(repo.unknownBlocks()).toEqual([]);
  });
  it("skips a block type it cannot render and names it instead", () => {
    const repo = createRepository({
      ...snapshot,
      homeBlocks: [
        { type: "hero", enabled: true, sortOrder: 0 },
        { type: "newsletter_signup", enabled: true, sortOrder: 1 },
        { type: "newsletter_signup", enabled: false, sortOrder: 2 },
      ],
    });
    expect(repo.blocks().map((block) => block.type)).toEqual(["hero"]);
    expect(repo.unknownBlocks()).toEqual(["newsletter_signup"]);
  });
  it("offers every block type on its defaults when the snapshot carries none", () => {
    const repo = createRepository(snapshot);
    expect(repo.blocks().map((block) => block.type)).toEqual([...homeBlockTypes]);
    expect(repo.unknownBlocks()).toEqual([]);
  });
  it("offers the same defaults when the database answers with an empty list", () => {
    // The backend reads the home_blocks table and sends what it holds. Nothing
    // arranged yet is an empty table, and a block switched off is a row, so an
    // empty list can only mean that nobody has arranged the page.
    const repo = createRepository({ ...snapshot, homeBlocks: [] });
    expect(repo.blocks().map((block) => block.type)).toEqual([...homeBlockTypes]);
  });
  it("excludes non-public states and other languages from every collection", () => {
    const repo = createRepository(snapshot);
    expect(repo.list({ language: "en" }).entries.map((item) => item.id)).toEqual([1]);
    expect(repo.list({ language: "en", query: "Entry 2" }).total).toBe(0);
    const published = repo.entry("/entry-1/");
    if (!published) throw new Error("Public fixture entry missing");
    expect(repo.related(published).map((item) => item.id)).toEqual([]);
  });
  it("serves hidden only by known address, and refuses a draft or a trashed body", () => {
    const repo = createRepository(snapshot);
    expect(repo.entry("/entry-2/")?.visibility).toBe("hidden");
    for (const id of [3, 4]) expect(repo.entry(`/entry-${id}/`)).toBeUndefined();
  });
  it("lists an entry in the other language as well only when asked and while that language has no version", () => {
    const shown = { ...entry(7), showInOtherLanguage: true };
    const translated = { ...entry(8), showInOtherLanguage: true, translationPath: "/de/entry-9/" };
    const repository = createRepository({ ...snapshot, entries: [entry(6), shown, translated] });

    expect(repository.publicEntries("de").map((item) => item.path)).toEqual(["/entry-7/"]);
    expect(
      repository
        .publicEntries("en")
        .map((item) => item.path)
        .sort(),
    ).toEqual(["/entry-6/", "/entry-7/", "/entry-8/"]);
  });

  it("knows the addresses of deleted entries, and accepts a snapshot that names none", () => {
    const repository = createRepository({ ...snapshot, gone: ["/deleted/"] });
    expect(repository.gone("/deleted/")).toBe(true);
    expect(repository.gone("/entry-1/")).toBe(false);
    expect(createRepository(snapshot).gone("/deleted/")).toBe(false);
    expect(() => createRepository({ ...snapshot, gone: ["//evil.test/"] })).toThrow();
  });

  it("resolves only local redirects and rejects duplicate public addresses", () => {
    expect(createRepository(snapshot).redirect("/old/")).toBe("/entry-1/");
    expect(() =>
      createRepository({ ...snapshot, redirects: [{ source: "/old/", target: "//evil.test/" }] }),
    ).toThrow();
    expect(() => createRepository({ ...snapshot, entries: [entry(1), entry(1)] })).toThrow();
  });
  it("pages an overview by its own page size, and a topic by the posts' one", () => {
    const repo = createRepository({
      ...snapshot,
      entries: Array.from({ length: 7 }, (_, i) => ({ ...entry(i + 1), kind: i < 4 ? "post" : "project" })),
      listings: {
        post: { ...DEFAULT_LISTING, pageSize: 3 },
        project: { ...DEFAULT_LISTING, pageSize: 5, headline: { en: "Work", de: "" } },
      },
    });
    expect(repo.list({ language: "en", kind: "post" }).pages).toBe(2);
    expect(repo.list({ language: "en", kind: "project" }).pages).toBe(1);
    expect(repo.list({ language: "en", topic: "1" }).entries).toHaveLength(3);
    expect(repo.listing("project").headline.en).toBe("Work");
  });

  it("uses the default overviews for a snapshot that names none", () => {
    expect(createRepository(snapshot).listing("post")).toEqual(DEFAULT_LISTING);
  });

  it("shortens a preview at a word to the length it is given", () => {
    const long = createRepository({
      ...snapshot,
      entries: [{ ...entry(1), summary: "one two three four five six seven eight nine ten" }],
    }).entry("/entry-1/");
    expect(summaryOf(long as never, 20)).toBe("one two three four…");
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
  it("uses German topic names and slugs while filtering entries by stable topic id", () => {
    const repo = createRepository({
      ...snapshot,
      topics: [
        {
          id: "1",
          translations: {
            en: { name: "Electronics", slug: "electronics" },
            de: { name: "Elektronik", slug: "elektronik" },
          },
        },
      ],
    });

    expect(repo.topicBySlug("en", "electronics")?.id).toBe("1");
    expect(repo.topicBySlug("de", "elektronik")?.id).toBe("1");
    expect(repo.topicBySlug("de", "electronics")).toBeUndefined();
    expect(repo.topics("de")).toMatchObject([
      { name: "Elektronik", slug: "elektronik", untranslated: false },
    ]);
    expect(topicPath("de", repo.topics("de")[0]?.slug ?? "")).toBe("/de/topics/elektronik/");
    expect(repo.list({ language: "de", topic: "1" }).entries.map((item) => item.id)).toEqual([6]);
    expect(repo.searchIndex("de")[0]?.text).toContain("elektronik");
    expect(repo.searchIndex("en")[0]?.text).toContain("electronics");
  });

  it("marks an untranslated topic and keeps its English name and slug in German", () => {
    const repo = createRepository(snapshot);
    expect(repo.topicBySlug("de", "hardware")).toMatchObject({
      name: "Hardware",
      slug: "hardware",
      untranslated: true,
    });
    expect(repo.topics("de")).toMatchObject([{ name: "Hardware", slug: "hardware", untranslated: true }]);
  });
  it("keeps a German-only topic reachable in German and marks its English fallback", () => {
    const repo = createRepository({
      ...snapshot,
      topics: [{ id: "1", translations: { en: null, de: { name: "Elektronik", slug: "elektronik" } } }],
    });
    expect(repo.topicBySlug("de", "elektronik")).toMatchObject({
      name: "Elektronik",
      sourceLanguage: "de",
      untranslated: false,
    });
    expect(repo.topicBySlug("en", "elektronik")).toMatchObject({
      sourceLanguage: "de",
      untranslated: true,
    });
  });
  it("reads the old backend snapshot while services are rolling out", () => {
    const repo = createRepository({
      ...snapshot,
      entries: [{ ...entry(1), topics: ["hardware"] }],
      topics: [{ id: 1, slug: "hardware", name: "Hardware" }],
      redirects: [],
    });
    expect(repo.data.entries[0]?.topics).toEqual(["1"]);
    expect(repo.topicBySlug("de", "hardware")?.untranslated).toBe(true);
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

describe("the home page's blocks, as their settings say", () => {
  const dated = (id: number, kind: string, publishedAt: string, extra: Record<string, unknown> = {}) => ({
    ...entry(id),
    title: `Title ${String.fromCharCode(76 - id)}`,
    kind,
    publishedAt,
    ...extra,
  });
  const page = (homeBlocks: { type: string; settings?: Record<string, unknown> }[]) =>
    createRepository({
      ...snapshot,
      entries: [
        dated(1, "project", "2026-04-01T00:00:00Z", { featuredImage: "own-picture" }),
        dated(2, "post", "2026-03-01T00:00:00Z", { featured: true }),
        dated(3, "post", "2026-02-01T00:00:00Z"),
        dated(4, "post", "2026-01-01T00:00:00Z"),
      ],
      media: [
        { slug: "own-picture", src: "/uploads/own" },
        { slug: "chosen-picture", src: "/uploads/chosen" },
      ],
      homeBlocks: homeBlocks.map((block, sortOrder) => ({
        enabled: true,
        sortOrder,
        settings: {},
        ...block,
      })),
    });

  it("shows the hero's own picture where one is chosen, the entry's otherwise, and none when switched off", () => {
    expect(page([{ type: "hero" }]).homeHero("en").image?.src).toBe("/uploads/own");
    expect(page([{ type: "hero", settings: { picture: "chosen-picture" } }]).homeHero("en").image?.src).toBe(
      "/uploads/chosen",
    );
    expect(page([{ type: "hero", settings: { showPicture: false } }]).homeHero("en").image).toBeUndefined();
  });

  it("features the marked entry, or the newest when the block asks for that", () => {
    expect(page([{ type: "featured_entry" }]).homeFeatured("en")?.id).toBe(2);
    expect(page([{ type: "featured_entry", settings: { source: "newest" } }]).homeFeatured("en")?.id).toBe(1);
  });

  it("fills a grid in its order, up to its limit, and without the featured entry where asked", () => {
    const grid = (settings: Record<string, unknown>) =>
      page([{ type: "featured_entry" }, { type: "post_grid", settings }])
        .homeGrid("post_grid", settings, "en")
        .entries.map((item) => item.id);
    expect(grid({})).toEqual([2, 3, 4]);
    expect(grid({ order: "oldest", limit: 2 })).toEqual([4, 3]);
    expect(grid({ order: "title" })).toEqual([4, 3, 2]);
    expect(grid({ excludeFeatured: true })).toEqual([3, 4]);
  });
});

describe("where the media are served from", () => {
  it("uses the requested language and preserves explicitly decorative images", () => {
    const repo = createRepository({
      ...snapshot,
      media: [
        {
          slug: "localized",
          src: "/uploads/localized",
          alt: "old",
          translations: {
            en: { altText: "", caption: "English" },
            de: { altText: "Berge", caption: "Deutsch" },
          },
        },
      ],
    });
    expect(repo.media("localized", "en")).toMatchObject({ alt: "", caption: "English" });
    expect(repo.media("localized", "de")).toMatchObject({ alt: "Berge", caption: "Deutsch" });
  });
  it("carries the stored focal point to every image consumer", () => {
    const asset = createRepository({
      ...snapshot,
      media: [{ slug: "focal", src: "/uploads/focal", focalPoint: { x: 0.2, y: 0.8 } }],
    }).media("focal");
    expect(asset?.focalPoint).toEqual({ x: 0.2, y: 0.8 });
  });
  const withMedia = {
    ...snapshot,
    media: [
      {
        slug: "a-picture",
        src: "/migration/a-picture.webp",
        srcSet: "/migration/a-picture-variant-480.webp 480w, /migration/a-picture-variant-960.webp 960w",
      },
      { slug: "an-upload", src: "/uploads/tl_WnGQ4duhWJVeRjRqMmQ" },
    ],
  };

  it("leaves the paths alone when nothing says otherwise, which is the local case", () => {
    delete process.env.MEDIA_ORIGIN;
    const asset = createRepository(withMedia).media("a-picture");
    expect(asset?.src).toBe("/migration/a-picture.webp");
    expect(asset?.srcSet).toBe(
      "/migration/a-picture-variant-480.webp 480w, /migration/a-picture-variant-960.webp 960w",
    );
  });

  it("puts the bucket's origin in front of every key, migrated and uploaded alike, keeping the widths", () => {
    process.env.MEDIA_ORIGIN = "https://storage.example/bucket";
    try {
      const repository = createRepository(withMedia);
      const asset = repository.media("a-picture");
      expect(asset?.src).toBe("https://storage.example/bucket/migration/a-picture.webp");
      expect(asset?.srcSet).toBe(
        "https://storage.example/bucket/migration/a-picture-variant-480.webp 480w, https://storage.example/bucket/migration/a-picture-variant-960.webp 960w",
      );
      expect(repository.media("an-upload")?.src).toBe(
        "https://storage.example/bucket/uploads/tl_WnGQ4duhWJVeRjRqMmQ",
      );
    } finally {
      delete process.env.MEDIA_ORIGIN;
    }
  });

  it("tolerates a trailing slash on the origin rather than doubling it", () => {
    process.env.MEDIA_ORIGIN = "https://storage.example/bucket/";
    try {
      expect(createRepository(withMedia).media("a-picture")?.src).toBe(
        "https://storage.example/bucket/migration/a-picture.webp",
      );
    } finally {
      delete process.env.MEDIA_ORIGIN;
    }
  });

  it("finds a file the export names by its old path below the prefix the upload put it under", () => {
    process.env.MEDIA_ORIGIN = "https://storage.example/bucket";
    try {
      const exported = createRepository({
        ...snapshot,
        media: [{ slug: "a-picture", src: "/media/a-picture.webp" }],
      });
      expect(exported.media("a-picture")?.src).toBe(
        "https://storage.example/bucket/migration/a-picture.webp",
      );
    } finally {
      delete process.env.MEDIA_ORIGIN;
    }
  });

  it("routes authored legacy file links to the bucket without changing page links", () => {
    process.env.MEDIA_ORIGIN = "https://storage.example/bucket";
    try {
      const repository = createRepository(withMedia);
      expect(repository.contentUrl("/media/cheat-sheet-nano.pdf")).toBe(
        "https://storage.example/bucket/migration/cheat-sheet-nano.pdf",
      );
      expect(repository.contentUrl("/projects/")).toBe("/projects/");
    } finally {
      delete process.env.MEDIA_ORIGIN;
    }
  });

  it("refuses a path that is not one key below the origin", () => {
    for (const src of ["//evil.test/x.webp", "/migration/../x", "https://evil.test/x.webp"]) {
      expect(() => createRepository({ ...snapshot, media: [{ slug: "bad", src }] })).toThrow();
    }
  });
});
