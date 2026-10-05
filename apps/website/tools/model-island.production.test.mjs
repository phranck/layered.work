import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { loadProductionApp } from "./production-app.mjs";

test("keeps the viewer off ordinary pages and defers all three migrated models behind real posters", async () => {
  const snapshot = JSON.parse(await readFile(new URL("../content/site.json", import.meta.url), "utf8"));
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.API_URL;
  const originalMode = process.env.WEBSITE_MODE;
  process.env.WEBSITE_MODE = "site";
  process.env.API_URL = "https://fixture.example.test";
  globalThis.fetch = async () => Response.json(snapshot);
  try {
    const app = await loadProductionApp(new URL("../dist/server", import.meta.url).pathname);
    for (const path of ["/", "/nextstep-on-rpi5-en/"]) {
      const html = await (await app.render(new Request(`https://layered.work${path}`))).text();
      assert(!html.includes("ModelViewer.astro"), "A page without models must not include the viewer island");
      assert(!html.includes("<model-viewer"));
    }
    for (const path of [
      "/projects/next-soundbox/",
      "/projects/touch-magic/",
      "/de/website-design-die-zweite/",
    ]) {
      const response = await app.render(new Request(`https://layered.work${path}`));
      assert.equal(response.status, 200);
      const html = await response.text();
      const policy = response.headers.get("content-security-policy");
      for (const script of html.matchAll(/<script\b([^>]*)>/g)) {
        if (/\bsrc=|application\/ld\+json/.test(script[1])) continue;
        const nonce = /nonce="([^"]+)"/.exec(script[1]);
        assert(
          nonce && policy.includes(`'nonce-${nonce[1]}'`),
          "Inline helpers must use this response's CSP nonce",
        );
      }
      const models = [...html.matchAll(/<model-viewer\b([^>]*)>([\s\S]*?)<\/model-viewer>/g)];
      assert.equal(models.length, 1, path);
      assert.match(models[0][1], /data-model-src="[^"]+\.glb"/);
      assert(!/(?:^|\s)src=/.test(models[0][1]), "GLB must not be exposed before viewport activation");
      assert.match(models[0][1], /auto-rotate=""/);
      assert.match(models[0][1], /alt="[^"]+"/);
      assert.match(models[0][2], /<img slot="poster" src="[^"]+"/);
      assert(html.includes("ModelViewer.astro"));
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.API_URL;
    else process.env.API_URL = originalUrl;
    if (originalMode === undefined) delete process.env.WEBSITE_MODE;
    else process.env.WEBSITE_MODE = originalMode;
  }
});
