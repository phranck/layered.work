import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { prepareDeployment } from "./deploy.mjs";

test("the dashboard ships shared assets and nginx policy with SPA fallback", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "layered-dashboard-build-"));
  try {
    await prepareDeployment(pathToFileURL(`${workspace}/dist/`), "https://api.example.test");
    const fonts = await readFile(join(workspace, "dist/fonts.css"), "utf8");
    for (const family of ["Barlow", "Barlow Condensed", "FiraCode Nerd Font"]) {
      assert.ok(fonts.includes(`font-family: "${family}"`));
    }
    assert.doesNotMatch(fonts, /https?:|local\(/);
    const fontUrls = [...fonts.matchAll(/url\("(.+?)"\)/g)].map((match) => match[1]);
    assert.ok(fontUrls.length >= 3);
    for (const fontUrl of fontUrls) {
      const font = await readFile(join(workspace, "dist", fontUrl));
      assert.equal(font.subarray(0, 4).toString(), "wOF2");
    }
    assert.match(await readFile(join(workspace, "dist/THIRD_PARTY_NOTICES.md"), "utf8"), /Fira/);
    assert.deepEqual(
      await readFile(join(workspace, "dist/logo.svg")),
      await readFile(new URL("../../prototype/assets/logo.svg", import.meta.url)),
    );
    const brandFiles = ["github.svg", "instagram.svg", "mastodon.svg", "xing.svg", "youtube.svg"];
    assert.deepEqual((await readdir(join(workspace, "dist/brands"))).sort(), brandFiles);
    for (const brandFile of brandFiles) {
      assert.deepEqual(
        await readFile(join(workspace, "dist/brands", brandFile)),
        await readFile(new URL(`../../prototype/assets/brands/${brandFile}`, import.meta.url)),
      );
    }
    assert.match(await readFile(join(workspace, "dist/ICON_NOTICES.md"), "utf8"), /Simple Icons 15\.16\.0/);
    assert.match(
      await readFile(join(workspace, "dist/icon-licenses/Simple-Icons-CC0-1.0.txt"), "utf8"),
      /CC0 1\.0 Universal/,
    );
    assert.match(
      await readFile(join(workspace, "dist/icon-licenses/Phosphor-Icons-MIT-2.1.10.txt"), "utf8"),
      /MIT License/,
    );
    const nginx = await readFile(join(workspace, "dist/site.conf"), "utf8");
    assert.match(nginx, /Content-Security-Policy/);
    assert.match(nginx, /connect-src 'self' https:\/\/api\.example\.test/);
    assert.match(nginx, /try_files \$uri \$uri\/ \/index\.html/);
    assert.match(nginx, /location \/assets\//);
    assert.match(nginx, /try_files \$uri =404/);
    assert.match(await readFile(join(workspace, "dist/DEPENDENCY_LICENSES.txt"), "utf8"), /react-router@/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
