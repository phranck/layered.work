import assert from "node:assert/strict";
import { test } from "node:test";
import { loadProductionApp } from "./production-app.mjs";

/**
 * The picture an entry opens with is asked for in the head, with exactly the
 * candidates and widths its `img` names. Anything else and the browser fetches
 * it twice, or finds it only once the document has been read.
 */

/** One attribute of the first element matching a pattern, as the page wrote it. */
function attribute(html, element, name) {
  const tag = element.exec(html)?.[0] ?? "";
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
}

test("asks for an entry's opening picture in the head, as its page draws it", async () => {
  const cover = {
    mime: "image/webp",
    width: 1200,
    height: 700,
    srcSet: "/media/cover-480.webp 480w, /media/cover-960.webp 960w, /media/cover-1200.webp 1200w",
  };
  const snapshot = {
    topics: [],
    redirects: [],
    media: [
      { slug: "post-cover", src: "/media/post-cover.jpg", ...cover },
      { slug: "project-hero", src: "/media/project-hero.jpg", ...cover },
    ],
    entries: [
      { id: "post", path: "/with-cover/", kind: "post", featuredImage: "post-cover" },
      { id: "project", path: "/projects/with-hero/", kind: "project", featuredImage: "project-hero" },
      { id: "plain", path: "/without-cover/", kind: "post" },
    ].map((entry) => ({
      title: "Entry title",
      slug: entry.id,
      language: "en",
      visibility: "public",
      body: "A paragraph.",
      topics: [],
      publishedAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-02T00:00:00Z",
      ...entry,
    })),
  };
  const saved = { fetch: globalThis.fetch, url: process.env.API_URL, mode: process.env.WEBSITE_MODE };
  process.env.API_URL = "https://fixture.example.test";
  process.env.WEBSITE_MODE = "site";
  globalThis.fetch = async () => Response.json(snapshot);
  try {
    const app = await loadProductionApp(new URL("../dist/server", import.meta.url).pathname);
    for (const path of ["/with-cover/", "/projects/with-hero/"]) {
      const html = await (await app.render(new Request(`https://layered.work${path}`))).text();
      const head = html.slice(0, html.indexOf("</head>"));
      const body = html.slice(html.indexOf("<body"));
      const preload = /<link rel="preload" as="image"[^>]*>/;
      const opening = /<img[^>]*fetchpriority="high"[^>]*>/;

      assert.equal([...head.matchAll(new RegExp(preload, "g"))].length, 1, path);
      assert.equal(attribute(head, preload, "imagesrcset"), attribute(body, opening, "srcset"), path);
      assert.equal(attribute(head, preload, "imagesizes"), attribute(body, opening, "sizes"), path);
      assert.equal(attribute(head, preload, "href"), attribute(body, opening, "src"), path);
      assert.equal(
        attribute(body, opening, "sizes"),
        "(max-width: 719px) 100vw, (max-width: 1179px) 92vw, 1092px",
        path,
      );
    }

    const plain = await (await app.render(new Request("https://layered.work/without-cover/"))).text();
    assert(!plain.slice(0, plain.indexOf("</head>")).includes('as="image"'));
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
