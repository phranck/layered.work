import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { loadProductionApp } from "./production-app.mjs";

test("keeps bilingual standard links until main navigation is configured", async () => {
  const snapshot = JSON.parse(await readFile(new URL("../content/site.json", import.meta.url), "utf8"));
  delete snapshot.mainNavigation;
  const saved = { fetch: globalThis.fetch, url: process.env.API_URL, mode: process.env.WEBSITE_MODE };
  process.env.API_URL = "https://fixture.example.test";
  process.env.WEBSITE_MODE = "site";
  globalThis.fetch = async () => Response.json(snapshot);
  try {
    const app = await loadProductionApp(new URL("../dist/server", import.meta.url).pathname);
    for (const [path, projects, posts] of [
      ["/", "Projects", "Posts"],
      ["/de/", "Projekte", "Beiträge"],
    ]) {
      const response = await app.render(new Request(`https://layered.work${path}`));
      assert.equal(response.status, 200);
      const html = await response.text();
      const nav = /<nav class="site-nav"[^>]*>(.*?)<\/nav>/s.exec(html)?.[1];
      assert(nav);
      assert(nav.includes(`href="${path}projects/"`));
      assert(nav.includes(`href="${path}posts/"`));
      assert(nav.includes(projects));
      assert(nav.includes(posts));
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
