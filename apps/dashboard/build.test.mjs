import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { readApiError } from "@layered/schemas";
import { prepareDeployment } from "./deploy.mjs";
import viteConfig from "./vite.config.mjs";

test("the dashboard ships shared assets and nginx policy with SPA fallback", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "layered-dashboard-build-"));
  try {
    await prepareDeployment(pathToFileURL(`${workspace}/dist/`), "http://backend:3000");
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
    assert.match(nginx, /connect-src 'self' https:\/\/umami.layered.work;/);
    assert.doesNotMatch(nginx, /connect-src[^;]*(?:backend|undefined)/);
    assert.match(nginx, /location \/api\//);
    assert.match(nginx, /proxy_pass http:\/\/backend:3000\//);
    assert.match(nginx, /proxy_set_header X-Forwarded-For \$http_x_forwarded_for/);
    assert.match(nginx, /proxy_intercept_errors off/);
    assert.match(nginx, /proxy_cache off/);
    assert.doesNotMatch(nginx, /proxy_cookie_(?:path|domain)/);
    const proxyErrorLocation = nginx.split("location @api_unavailable")[1].split("# Missing bundles")[0];
    for (const name of [
      "Content-Security-Policy",
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Referrer-Policy",
    ]) {
      assert.ok(proxyErrorLocation.includes(`add_header ${name} `));
    }
    assert.match(proxyErrorLocation, /access_log syslog:.* dashboard_api_failure/);
    assert.match(nginx, /"errorId":"\$request_id"/);
    const proxyFailure = JSON.parse(nginx.match(/return 502 '(.*?)';/)[1]);
    assert.deepEqual(readApiError(proxyFailure), {
      code: "internal",
      message: "The API is temporarily unavailable.",
      id: "$request_id",
    });
    assert.match(nginx, /try_files \$uri \$uri\/ \/index\.html/);
    assert.match(nginx, /location \/assets\//);
    assert.match(nginx, /try_files \$uri =404/);
    assert.match(await readFile(join(workspace, "dist/DEPENDENCY_LICENSES.txt"), "utf8"), /react-router@/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("development and production bundles use the same-origin API transport", () => {
  for (const command of ["serve", "build"]) {
    const config = viteConfig({ command });
    assert.equal(JSON.parse(config.define.__API_BASE__), "/api");
    assert.equal(config.server.proxy["/api"].rewrite("/api/auth/me"), "/auth/me");
    assert.equal(config.server.proxy["/api"].rewrite("/api/dashboard/counts"), "/dashboard/counts");
  }
});
