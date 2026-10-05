import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { loadProductionApp } from "./production-app.mjs";

test("uses API search for the rendered page and both overlay routes, preserving API failures", async () => {
  const snapshot = JSON.parse(await readFile(new URL("../content/site.json", import.meta.url), "utf8"));
  const selected = snapshot.entries.find((entry) => entry.visibility === "public" && entry.language === "en");
  assert(selected);
  const hit = { path: selected.path, title: selected.title, kind: selected.kind, language: "en" };
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.API_URL;
  const originalMode = process.env.WEBSITE_MODE;
  process.env.WEBSITE_MODE = "site";
  process.env.API_URL = "https://fixture.example.test";
  const requests = [];
  let failed = false;
  globalThis.fetch = async (source) => {
    const url = new URL(source);
    if (url.pathname === "/content/snapshot") return Response.json(snapshot);
    assert.equal(url.pathname, "/content/search");
    requests.push(url);
    return failed
      ? Response.json(
          { error: { code: "internal", message: "Search failed safely.", id: "probe-failure" } },
          { status: 500 },
        )
      : Response.json({ entries: [hit], total: 1 });
  };
  try {
    const app = await loadProductionApp(new URL("../dist/server", import.meta.url).pathname);
    const page = await app.render(new Request("https://layered.work/search/?q=ftsprobe"));
    assert.equal(page.status, 200);
    assert(
      (await page.text()).includes(`href="${selected.path}"`),
      "SSR must use backend matches rather than snapshot substring matching",
    );
    for (const [path, language] of [
      ["/search.json", "en"],
      ["/de/search.json", "de"],
    ]) {
      const response = await app.render(new Request(`https://layered.work${path}?q=ftsprobe`));
      assert.equal(response.status, 200);
      assert.equal(requests.at(-1).searchParams.get("language"), language);
      assert.deepEqual(await response.json(), { entries: [hit], total: 1 });
    }
    failed = true;
    const error = await app.render(new Request("https://layered.work/search.json?q=ftsprobe"));
    assert.equal(error.status, 500);
    assert.deepEqual(await error.json(), {
      error: { code: "internal", message: "Search failed safely.", id: "probe-failure" },
    });
    const pageError = await app.render(new Request("https://layered.work/search/?q=ftsprobe"));
    assert.equal(pageError.status, 500);
    assert((await pageError.text()).includes("probe-failure"));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.API_URL;
    else process.env.API_URL = originalUrl;
    if (originalMode === undefined) delete process.env.WEBSITE_MODE;
    else process.env.WEBSITE_MODE = originalMode;
  }
});
