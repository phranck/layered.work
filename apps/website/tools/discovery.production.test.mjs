import assert from "node:assert/strict";
import { test } from "node:test";
import { loadProductionApp } from "./production-app.mjs";

test("serves localized RSS 2.0, JSON Feed and mutual public language links", async () => {
  const snapshot = {
    topics: [],
    media: [],
    redirects: [],
    entries: [
      {
        id: "en",
        language: "en",
        path: "/discovery/",
        translationPath: "/de/discovery/",
        visibility: "public",
        title: "English title",
      },
      {
        id: "de",
        language: "de",
        path: "/de/discovery/",
        translationPath: "/discovery/",
        visibility: "public",
        title: "Deutscher Titel",
      },
      { id: "hidden", language: "en", path: "/confidential/", visibility: "hidden", title: "Secret title" },
    ].map((entry) => ({
      slug: "discovery",
      kind: "post",
      body: "Full **body**.",
      topics: [],
      publishedAt: "2026-01-01T00:00:00Z",
      updatedAt: null,
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
    const render = (path) => app.render(new Request(`https://layered.work${path}`));
    for (const language of ["en", "de"]) {
      const prefix = language === "de" ? "/de" : "";
      const rss = await render(`${prefix}/feed.xml`);
      assert.equal(rss.status, 200);
      assert.match(rss.headers.get("content-type"), /application\/rss\+xml/);
      const xml = await rss.text();
      assert.match(xml, /<rss version="2.0"/);
      assert(xml.includes(`<language>${language}</language>`));
      assert(xml.includes("&lt;strong&gt;body&lt;/strong&gt;"));
      assert(!xml.includes("Secret title"));
      const json = await render(`${prefix}/feed.json`);
      assert.equal(json.status, 200);
      assert.match(json.headers.get("content-type"), /application\/feed\+json/);
      const feed = await json.json();
      assert.equal(feed.language, language);
      assert.equal(feed.items.length, 1);
      assert.equal(feed.items[0].language, language);
      assert(feed.items[0].content_html.includes("<strong>body</strong>"));
      for (const path of [`${prefix}/`, `${prefix}/discovery/`]) {
        const response = await render(path);
        assert.equal(response.status, 200);
        const html = await response.text();
        const links = [...html.matchAll(/<link\s[^>]*hreflang="([^"]+)"[^>]*href="([^"]+)"/g)];
        assert.deepEqual(links.map((match) => match[1]).sort(), ["de", "en", "x-default"]);
        assert.equal(
          links.find((match) => match[1] === "x-default")[2],
          path.endsWith("discovery/") ? "https://layered.work/discovery/" : "https://layered.work/",
        );
      }
    }
    const hidden = await render("/confidential/");
    assert(!/hreflang=/.test(await hidden.text()));
    const sitemap = await (await render("/sitemap.xml")).text();
    assert(sitemap.includes("/de/posts/"));
    assert(sitemap.includes('hreflang="x-default"'));
    assert(!sitemap.includes("confidential"));
    assert(
      (await (await render("/robots.txt")).text()).includes("Sitemap: https://layered.work/sitemap.xml"),
    );
    process.env.WEBSITE_MODE = "countdown";
    for (const path of ["/feed.xml", "/feed.json", "/de/feed.xml", "/de/feed.json"]) {
      assert.equal((await render(path)).status, 404);
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
