import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFile, mkdtemp, readdir, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("the dashboard ships shared components and their complete stylesheet dependencies", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "layered-dashboard-build-"));
  try {
    await copyFile(new URL("./build.mjs", import.meta.url), join(workspace, "build.mjs"));
    await symlink(fileURLToPath(new URL("./node_modules", import.meta.url)), join(workspace, "node_modules"));
    execFileSync(process.execPath, [...process.execArgv, join(workspace, "build.mjs")], {
      env: {
        ...process.env,
        TSX_TSCONFIG_PATH: fileURLToPath(new URL("../../packages/ui/tsconfig.json", import.meta.url)),
      },
    });
    const html = await readFile(join(workspace, "dist/index.html"), "utf8");
    for (const component of ["card", "row", "section"]) {
      assert.match(html, new RegExp(`class="${component}(?: |")`));
    }
    assert.match(html, /class="workbench"/);
    assert.doesNotMatch(html, /<script/);
    assert.match(html, /href="\.\/styles\/base.css"/);
    assert.match(html, /href="\.\/fonts.css"/);
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
    for (const component of ["card", "row", "section"]) {
      assert.equal(
        await readFile(join(workspace, `dist/styles/ui/${component}.css`), "utf8"),
        await readFile(new URL(`../../prototype/ui/${component}.css`, import.meta.url), "utf8"),
      );
    }
    assert.match(
      await readFile(join(workspace, "dist/styles/tokens/semantic.css"), "utf8"),
      /--card-inner-radius/,
    );
    assert.match(await readFile(join(workspace, "dist/site.conf"), "utf8"), /Content-Security-Policy/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
