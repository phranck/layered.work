import { describe, expect, it } from "vitest";
import { jsonFeed, rssFeed, sitemap, sitemapPaths } from "./feeds.js";
import { languageLinks } from "./language-links.js";
import { createRepository } from "./repository.js";

const repository = createRepository({
  media: [],
  redirects: [],
  topics: [
    {
      id: "public-topic",
      translations: { en: { slug: "boards", name: "Boards" }, de: { slug: "platinen", name: "Platinen" } },
    },
    { id: "private-topic", translations: { en: { slug: "confidential", name: "Private" }, de: null } },
  ],
  entries: [
    {
      id: "en-pair",
      path: "/paired/",
      slug: "paired",
      language: "en",
      visibility: "public",
      translationPath: "/de/paired/",
      topics: ["public-topic"],
      title: "English <title>",
    },
    {
      id: "de-pair",
      path: "/de/paired/",
      slug: "paired",
      language: "de",
      visibility: "public",
      translationPath: "/paired/",
      topics: ["public-topic"],
      title: "Deutscher Titel",
    },
    {
      id: "public-hidden-pair",
      path: "/visible/",
      slug: "visible",
      language: "en",
      visibility: "public",
      translationPath: "/de/hidden/",
      topics: [],
      title: "Visible",
    },
    {
      id: "hidden",
      path: "/de/hidden/",
      slug: "hidden",
      language: "de",
      visibility: "hidden",
      translationPath: "/visible/",
      topics: ["private-topic"],
      title: "Confidential hidden",
    },
    {
      id: "draft",
      path: "/draft/",
      slug: "draft",
      language: "en",
      visibility: "draft",
      topics: ["private-topic"],
      title: "Confidential draft",
    },
    {
      id: "trashed",
      path: "/trashed/",
      slug: "trashed",
      language: "en",
      visibility: "trashed",
      topics: ["private-topic"],
      title: "Confidential trashed",
    },
    {
      id: "shared",
      path: "/de/shared/",
      slug: "shared",
      language: "de",
      visibility: "public",
      showInOtherLanguage: true,
      topics: [],
      title: "Shared German",
    },
  ].map((entry) => ({
    kind: "post",
    publishedAt: "2026-01-01T00:00:00Z",
    updatedAt: null,
    body: "A complete **paragraph**.",
    ...entry,
  })),
});

describe("localized public discovery", () => {
  it("keeps both feeds renderable when historical prose contains incomplete URLs", () => {
    const historical = createRepository({
      ...repository.data,
      entries: repository.data.entries.map((entry) => ({
        ...entry,
        body: '[Incomplete](https://)\n\n![Broken](https://[)\n\n[Valid](../valid/)\n\nButton("Download", href: "download/")\n\nCard(title: "More", href: "more/") { Prose. }',
      })),
    });
    for (const language of ["en", "de"] as const) {
      const json = jsonFeed(historical, language);
      const rss = rssFeed(historical, language);
      expect(json.items[0]?.content_html).toContain("Incomplete");
      expect(json.items[0]?.content_html).toContain("https://layered.work/");
      expect(rss).toContain("Incomplete");
      expect(json.items[0]?.content_html).not.toContain('href="https://"');
      expect(json.items[0]?.content_html).not.toMatch(/href="(?:download|more)\//);
      expect(rss).not.toMatch(/href=&quot;(?:download|more)\//);
    }
  });
  it("declares the feed language and keeps the legacy JSON item fields", () => {
    const en = jsonFeed(repository, "en");
    const de = jsonFeed(repository, "de");
    expect(en.language).toBe("en");
    expect(de.language).toBe("de");
    expect(de.feed_url).toBe("https://layered.work/de/feed.json");
    expect(de.home_page_url).toBe("https://layered.work/de/");
    expect(en.items.map((item) => item.url).sort()).toEqual([
      "https://layered.work/de/shared/",
      "https://layered.work/paired/",
      "https://layered.work/visible/",
    ]);
    expect(de.items.map((item) => item.url).sort()).toEqual([
      "https://layered.work/de/paired/",
      "https://layered.work/de/shared/",
    ]);
    const item = en.items.find((item) => item.url.endsWith("/paired/"));
    expect(item).toMatchObject({
      summary: expect.any(String),
      content_html: expect.stringContaining("<strong>paragraph</strong>"),
      author: { name: expect.any(String) },
      tags: ["Boards"],
    });
    expect(JSON.stringify(en)).not.toMatch(/Confidential|\/draft\/|\/trashed\//);
  });

  it("indexes listings and public topics without private paths", () => {
    const paths = sitemapPaths(repository);
    expect(paths).toEqual(
      expect.arrayContaining([
        "/",
        "/de/",
        "/posts/",
        "/de/posts/",
        "/projects/",
        "/de/projects/",
        "/topics/",
        "/de/topics/",
        "/topics/boards/",
        "/de/topics/platinen/",
      ]),
    );
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.join(" ")).not.toMatch(/hidden|draft|trashed|confidential/);
  });

  it("puts mutual public alternates and x-default on both sitemap entries", () => {
    const output = sitemap(sitemapPaths(repository), repository);
    expect(output).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    const urls = [...output.matchAll(/<url>(.*?)<\/url>/g)].map((match) => match[1] ?? "");
    for (const path of ["/paired/", "/de/paired/"]) {
      const url = urls.find((url) => url.startsWith(`<loc>https://layered.work${path}</loc>`));
      expect(url).toContain('hreflang="en" href="https://layered.work/paired/"');
      expect(url).toContain('hreflang="de" href="https://layered.work/de/paired/"');
      expect(url).toContain('hreflang="x-default" href="https://layered.work/paired/"');
    }
    expect(output).not.toMatch(/hidden|draft|trashed|confidential/);
  });

  it("does not advertise private, one-way or nonexistent translations", () => {
    expect(languageLinks(repository, "/de/hidden/")).toEqual([]);
    expect(languageLinks(repository, "/draft/")).toEqual([]);
    expect(languageLinks(repository, "/visible/")).toEqual([
      { language: "en", path: "/visible/" },
      { language: "x-default", path: "/visible/" },
    ]);
    expect(languageLinks(repository, "/de/topics/boards/")).toEqual([]);
    expect(languageLinks(repository, "/topics/boards/")).toEqual([
      { language: "en", path: "/topics/boards/" },
      { language: "de", path: "/de/topics/platinen/" },
      { language: "x-default", path: "/topics/boards/" },
    ]);
    const oneWay = createRepository({
      ...repository.data,
      entries: repository.data.entries.map((entry) =>
        entry.id === "de-pair" ? { ...entry, translationPath: null } : entry,
      ),
    });
    expect(languageLinks(oneWay, "/paired/").map((link) => link.language)).toEqual(["en", "x-default"]);
  });
});
