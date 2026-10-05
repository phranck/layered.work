import assert from "node:assert/strict";
import { test } from "node:test";
import { loadProductionApp } from "./production-app.mjs";

test("renders canonical metadata and article data without exposing private summaries", async () => {
  const snapshot = {
    topics: [],
    redirects: [],
    media: [
      { slug: "own-cover", src: "/media/cover.jpg", mime: "image/jpeg", width: 800, height: 500 },
      { slug: "generated-card", src: "/uploads/generated.png", mime: "image/png", width: 1200, height: 630 },
    ],
    entries: [
      {
        id: "public",
        path: "/metadata/",
        visibility: "public",
        featuredImage: "own-cover",
        socialImage: "generated-card",
      },
      { id: "generated", path: "/generated/", visibility: "public", socialImage: "generated-card" },
      { id: "hidden", path: "/private/", visibility: "hidden", socialImage: "generated-card" },
    ].map((entry) => ({
      title: "Entry title",
      slug: "metadata",
      language: "en",
      kind: "post",
      body: "Private body marker",
      summary: "Private summary marker",
      topics: [],
      publishedAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-02T00:00:00Z",
      ...entry,
    })),
  };
  const saved = { fetch: globalThis.fetch, url: process.env.API_URL, mode: process.env.WEBSITE_MODE };
  process.env.API_URL = "https://fixture.example.test";
  process.env.WEBSITE_MODE = "site";
  globalThis.fetch = async (url) => {
    assert.equal(String(url), "https://fixture.example.test/content/snapshot");
    return Response.json(snapshot);
  };
  try {
    const app = await loadProductionApp(new URL("../dist/server", import.meta.url).pathname);
    for (const path of [
      "/",
      "/de/",
      "/posts/",
      "/de/projects/",
      "/topics/",
      "/search/",
      "/missing/",
      "/metadata/",
      "/generated/",
      "/private/",
    ]) {
      const response = await app.render(new Request(`https://layered.work${path}`));
      const html = await response.text();
      const head = html.slice(0, html.indexOf("</head>"));
      assert.equal([...head.matchAll(/rel="canonical"/g)].length, 1, path);
      for (const name of [
        "og:title",
        "og:description",
        "og:url",
        "og:image",
        "twitter:card",
        "twitter:title",
        "twitter:description",
        "twitter:image",
      ])
        assert(head.includes(`="${name}"`), `${path}: ${name}`);
      if (path === "/private/") {
        assert(!head.includes("Private summary marker"));
        assert(!head.includes("Private body marker"));
      }
      if (path === "/metadata/") {
        assert(head.includes('property="og:image" content="https://layered.work/media/cover.jpg"'));
        const data = JSON.parse(
          /<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/s.exec(head)[1],
        );
        assert.equal(data["@type"], "Article");
        assert.equal(data.headline, "Entry title");
        assert.equal(data.datePublished, snapshot.entries[0].publishedAt);
        assert.equal(data.dateModified, snapshot.entries[0].updatedAt);
        assert.equal(data.inLanguage, "en");
        assert.equal(data.timeRequired, "PT1M");
        assert.equal(data.mainEntityOfPage, "https://layered.work/metadata/");
      }
      if (path === "/generated/")
        assert(head.includes('property="og:image" content="https://layered.work/uploads/generated.png"'));
    }
  } finally {
    globalThis.fetch = saved.fetch;
    for (const [key, value] of [
      ["API_URL", saved.url],
      ["WEBSITE_MODE", saved.mode],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
