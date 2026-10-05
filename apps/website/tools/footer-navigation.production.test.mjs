import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { loadProductionApp } from "./production-app.mjs";

// Render the real production server without opening a listener or touching stored data.
test("renders stored footer groups, their order and both languages in the production build", async () => {
  const snapshot = JSON.parse(await readFile(new URL("../content/site.json", import.meta.url), "utf8"));
  snapshot.footerNavigation = {
    en: [
      { title: "Stored first", items: [{ label: "Stored link", href: "https://example.test/" }] },
      { title: "Stored second", items: [] },
    ],
    de: [
      {
        title: "Gespeichert zuerst",
        items: [{ label: "Gespeicherter Link", href: "https://example.test/" }],
      },
      { title: "Gespeichert danach", items: [] },
    ],
  };
  snapshot.mainNavigation = {
    en: [{ label: "Stored header", href: "/posts/" }],
    de: [{ label: "Gespeicherter Header", href: "/de/posts/" }],
  };
  snapshot.siteFrame = {
    title: { en: "Stored site", de: "Gespeicherte Website" },
    footerLine: { en: "Stored description", de: "Gespeicherte Beschreibung" },
    social: [{ platform: "github", handle: "Own account", href: "https://example.test/account" }],
  };
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.API_URL;
  const originalMode = process.env.WEBSITE_MODE;
  process.env.WEBSITE_MODE = "site";
  process.env.API_URL = "https://fixture.example.test";
  globalThis.fetch = async (url) => {
    assert.equal(String(url), "https://fixture.example.test/content/snapshot");
    return Response.json(snapshot);
  };
  try {
    const app = await loadProductionApp(new URL("../dist/server", import.meta.url).pathname);
    for (const [path, first, second, label] of [
      ["/", "Stored first", "Stored second", "Stored link"],
      ["/de/", "Gespeichert zuerst", "Gespeichert danach", "Gespeicherter Link"],
    ]) {
      const response = await app.render(new Request(`https://layered.work${path}`));
      assert.equal(response.status, 200);
      const html = await response.text();
      const footer = html.slice(html.indexOf('<footer class="site-footer"'));
      assert(footer.includes(`aria-label="${first}"`));
      assert(footer.includes(label));
      assert(footer.indexOf(first) < footer.indexOf(second));
      assert(!footer.includes('aria-label="Subscribe"'));
      assert(footer.includes(path === "/" ? "Stored description" : "Gespeicherte Beschreibung"));
      assert(footer.includes('data-brand="github"'));
      assert(footer.includes("https://example.test/account"));
      assert(html.includes(path === "/" ? "Stored header" : "Gespeicherter Header"));
      assert(html.includes(`<title>${path === "/" ? "Stored site" : "Gespeicherte Website"}</title>`));
      assert.equal(/<main[^>]*id="main-content"/.test(html), true);
      const missing = await app.render(new Request(`https://layered.work${path}fixture-missing-page/`));
      assert.equal(missing.status, 404);
      assert((await missing.text()).includes(path === "/" ? "Search the site" : "Zur Suche"));
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.API_URL;
    else process.env.API_URL = originalUrl;
    if (originalMode === undefined) delete process.env.WEBSITE_MODE;
    else process.env.WEBSITE_MODE = originalMode;
  }
});
