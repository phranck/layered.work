import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
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
