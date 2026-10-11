import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { readApiError } from "@layered/schemas";
import ts from "typescript";
import { build } from "vite";
import { dashboardApiOrigin, dashboardUploadOrigin } from "./config.mjs";
import { prepareDeployment } from "./deploy.mjs";
import viteConfig from "./vite.config.mjs";

async function buildFixture(source) {
  const workspace = await mkdtemp(join(tmpdir(), "layered-api-boundary-"));
  try {
    const entry = join(workspace, "entry.js");
    await writeFile(entry, source);
    return await build({
      configFile: false,
      root: workspace,
      logLevel: "silent",
      plugins: viteConfig({ command: "build" }).plugins,
      build: { write: false, rollupOptions: { input: entry } },
    });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

test("the dashboard build refuses a database client before resolving it", async () => {
  await assert.rejects(
    buildFixture('import postgres from "postgres"; globalThis.database = postgres();'),
    /Dashboard API boundary: database or server import/,
  );
});

test("the dashboard build refuses a direct database connection string in emitted code", async () => {
  await assert.rejects(
    buildFixture('globalThis.connection = "postgresql://example.test/private";'),
    /Dashboard API boundary: database connection string/,
  );
});

test("the dashboard build permits the same-origin API", async () => {
  await buildFixture('globalThis.load = () => fetch("/api/entries?kind=post");');
});

test("the API surface documents every dashboard client operation", async () => {
  const source = await readFile(new URL("./src/api.ts", import.meta.url), "utf8");
  const tree = ts.createSourceFile("api.ts", source, ts.ScriptTarget.Latest, true);
  const contract = tree.statements.find(
    (node) => ts.isInterfaceDeclaration(node) && node.name.text === "DashboardApi",
  );
  assert.ok(contract);
  const methods = contract.members.filter(ts.isMethodSignature).map((node) => node.name.getText(tree));
  const document = await readFile(new URL("../../docs/api-surface.md", import.meta.url), "utf8");
  const documented = [...document.matchAll(/^\| `([A-Za-z]+)` \|/gm)].map((match) => match[1]);
  assert.deepEqual(documented.toSorted(), methods.toSorted());
  assert.match(document, /GET \/forms\/:id\/submissions\/export/);
});

test("the dashboard ships shared assets and nginx policy with SPA fallback", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "layered-dashboard-build-"));
  try {
    await prepareDeployment(pathToFileURL(`${workspace}/dist/`), "http://backend.zerops:3000");
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
    // Every mark ships exactly as it was downloaded, and the five carried over
    // from the prototype are additionally checked against it, so neither copy
    // can drift from the other unnoticed.
    const brandFiles = [
      "github.svg",
      "gnubash.svg",
      "html5.svg",
      "instagram.svg",
      "mastodon.svg",
      "swift.svg",
      "xing.svg",
      "youtube.svg",
    ];
    assert.deepEqual((await readdir(join(workspace, "dist/brands"))).sort(), brandFiles);
    for (const brandFile of brandFiles) {
      assert.deepEqual(
        await readFile(join(workspace, "dist/brands", brandFile)),
        await readFile(new URL(`../../packages/ui/assets/brands/${brandFile}`, import.meta.url)),
      );
    }
    for (const brandFile of ["github.svg", "instagram.svg", "mastodon.svg", "xing.svg", "youtube.svg"]) {
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
    // CodeMirror mounts its editor and syntax styles as runtime <style> elements.
    assert.match(nginx, /style-src 'self' 'unsafe-inline';/);
    assert.match(nginx, /script-src 'self';/);
    assert.match(nginx, /connect-src 'self' https:\/\/umami.layered.work;/);
    assert.doesNotMatch(nginx, /connect-src[^;]*(?:backend|undefined)/);
    assert.match(nginx, /location \/api\//);
    assert.match(nginx, /resolver 10\.18\.128\.1 valid=5s ipv6=off;/);
    assert.match(nginx, /set \$dashboard_api_origin http:\/\/backend\.zerops:3000;/);
    assert.ok(nginx.includes("rewrite ^/api/(.*)$ /$1 break;"));
    assert.match(nginx, /proxy_pass \$dashboard_api_origin;/);
    assert.match(nginx, /proxy_redirect http:\/\/backend\.zerops:3000\/ \/api\/;/);
    assert.doesNotMatch(nginx, /proxy_pass http:\/\/backend(?:\.zerops)?:3000\//);
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

test("the production proxy uses the complete Zerops service name for runtime DNS", async () => {
  const previous = process.env.API_ORIGIN;
  delete process.env.API_ORIGIN;
  try {
    assert.equal(dashboardApiOrigin("build"), "http://backend.zerops:3000");
  } finally {
    if (previous === undefined) delete process.env.API_ORIGIN;
    else process.env.API_ORIGIN = previous;
  }
  const zerops = await readFile(new URL("../../zerops.yml", import.meta.url), "utf8");
  assert.match(zerops, /API_ORIGIN: http:\/\/backend\.zerops:3000/);
  const dashboardService = zerops.split("  - setup: dashboard\n")[1];
  assert.match(dashboardService, /readinessCheck:[\s\S]*?path: \/api\/health\/ready/);
});

test("development and production bundles use the same-origin API transport", () => {
  for (const command of ["serve", "build"]) {
    const config = viteConfig({ command });
    const [api] = Object.values(config.server.proxy);
    assert.equal(JSON.parse(config.define.__API_BASE__), "/api");
    assert.equal(api.rewrite("/api/auth/me"), "/auth/me");
    assert.equal(api.rewrite("/api/dashboard/counts"), "/dashboard/counts");
  }
});

test("the development proxy takes /api only as a whole segment", () => {
  const proxyKeys = Object.keys(viteConfig({ command: "serve" }).server.proxy);
  // Vite's own rule (createProxyContextMatcher in vite 8): a key beginning with
  // `^` is a regular expression, any other key a prefix of the request path.
  const reachesApi = (path) =>
    proxyKeys.some((key) => (key[0] === "^" ? new RegExp(key).test(path) : path.startsWith(key)));
  assert.ok(reachesApi("/api"));
  assert.ok(reachesApi("/api/auth/me"));
  assert.ok(!reachesApi("/api-tokens"));
  assert.ok(!reachesApi("/apis"));
});

test("the local login alias reaches a development server and no built bundle", () => {
  const previous = { name: process.env.SEED_NAME, email: process.env.SEED_EMAIL };
  process.env.SEED_NAME = "local-owner";
  process.env.SEED_EMAIL = "Local.Owner@example.test";
  try {
    assert.equal(JSON.parse(viteConfig({ command: "build" }).define.__LOGIN_ALIAS__), null);
    assert.deepEqual(JSON.parse(viteConfig({ command: "serve" }).define.__LOGIN_ALIAS__), {
      username: "local-owner",
      email: "local.owner@example.test",
    });
  } finally {
    for (const [key, value] of [
      ["SEED_NAME", previous.name],
      ["SEED_EMAIL", previous.email],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("the deployed dashboard permits its configured presigned upload origin", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "layered-dashboard-upload-policy-"));
  try {
    await prepareDeployment(
      pathToFileURL(`${workspace}/dist/`),
      "http://backend.zerops:3000",
      "https://uploads.example.test",
    );
    const nginx = await readFile(join(workspace, "dist/site.conf"), "utf8");
    const connect = nginx.match(/connect-src ([^;]+);/)[1].split(" ");
    assert.ok(connect.includes("https://uploads.example.test"));
    assert.ok(connect.includes("'self'"));
    assert.ok(connect.includes("https://umami.layered.work"));
    assert.ok(!connect.includes("*"));
    assert.ok(!connect.includes("http://backend.zerops:3000"));
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("the upload policy reads only a complete HTTPS origin from the build environment", () => {
  const previous = process.env.S3_UPLOAD_ORIGIN;
  try {
    process.env.S3_UPLOAD_ORIGIN = "https://uploads.example.test/";
    assert.equal(dashboardUploadOrigin(), "https://uploads.example.test");
    for (const value of [
      "http://uploads.example.test",
      "https://user:password@uploads.example.test",
      "https://uploads.example.test/bucket",
      "https://uploads.example.test/?query=1",
      "https://uploads.example.test/#fragment",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: An unresolved Zerops reference must fail the build.
      "${assets_apiUrl}",
    ]) {
      process.env.S3_UPLOAD_ORIGIN = value;
      assert.throws(() => dashboardUploadOrigin(), /S3_UPLOAD_ORIGIN/);
    }
    delete process.env.S3_UPLOAD_ORIGIN;
    assert.equal(dashboardUploadOrigin(), undefined);
  } finally {
    if (previous === undefined) delete process.env.S3_UPLOAD_ORIGIN;
    else process.env.S3_UPLOAD_ORIGIN = previous;
  }
});

test("Zerops supplies its bucket API origin to the dashboard build", async () => {
  const zerops = await readFile(new URL("../../zerops.yml", import.meta.url), "utf8");
  const dashboard = zerops.split("  - setup: dashboard\n")[1];
  assert.match(dashboard, /S3_UPLOAD_ORIGIN: \$\{assets_apiUrl\}/);
});
