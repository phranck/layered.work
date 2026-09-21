/** Render the production Astro app without opening a network listener.
 * WEBSITE_CONTENT_FILE=/absolute/site.json node tools/render-preview.mjs --out /absolute/website-preview
 * The destination must be new or empty. Private migration data is never copied.
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { rewritePreloadHelper } from "./preview-assets.mjs";

// The same table the route redirects from, read rather than repeated, because a
// second copy here would pass its own check whilst the site answered 404.
const LEGACY_REDIRECTS = JSON.parse(
  await readFile(new URL("../src/content/legacy-redirects.json", import.meta.url), "utf8"),
);

const { values } = parseArgs({
  options: {
    out: { type: "string" },
    prefix: { type: "string", default: "/website-preview/" },
    "legacy-output": { type: "string" },
  },
});
assert(values.out, "Pass --out /absolute/website-preview");
assert(process.env.WEBSITE_CONTENT_FILE, "WEBSITE_CONTENT_FILE must name the private migration snapshot");
assert(/^\/(?:[a-zA-Z0-9_-]+\/)+$/.test(values.prefix), "--prefix must be an absolute directory path");
const output = resolve(values.out);
const prefix = values.prefix.replace(/\/$/, "");
const appDirectory = fileURLToPath(new URL("../", import.meta.url));
const clientDirectory = join(appDirectory, "dist/client");
const serverDirectory = join(appDirectory, "dist/server");
const origin = "https://layered.work";
const snapshot = JSON.parse(await readFile(resolve(process.env.WEBSITE_CONTENT_FILE), "utf8"));
const available = snapshot.entries.filter((entry) => ["public", "hidden"].includes(entry.visibility));
const excluded = snapshot.entries.filter((entry) => !["public", "hidden"].includes(entry.visibility));
const hidden = snapshot.entries.filter((entry) => entry.visibility === "hidden");
const routes = new Set([
  "/",
  "/en/",
  "/de/",
  "/feed.xml",
  "/feed.json",
  "/sitemap.xml",
  "/robots.txt",
  "/search-index.json",
  "/de/search-index.json",
]);
for (const language of ["en", "de"]) {
  const root = language === "de" ? "/de/" : "/";
  for (const path of ["posts/", "projects/", "topics/", "archive/", "search/"]) routes.add(`${root}${path}`);
  for (const topic of snapshot.topics) {
    if (
      snapshot.entries.some(
        (entry) =>
          entry.visibility === "public" && entry.language === language && entry.topics.includes(topic.slug),
      )
    ) {
      routes.add(`${root}topics/${topic.slug}/`);
    }
  }
  routes.add(`${root}search/?q=NeXT`);
}
for (const entry of available) routes.add(entry.path);
for (const redirect of snapshot.redirects) routes.add(redirect.source);
// Addresses the old site stopped generating before its final export, which the
// legacy output below therefore cannot contain.
for (const { source } of LEGACY_REDIRECTS) routes.add(source);
const legacyRoutes = [];
if (values["legacy-output"]) {
  const legacyDirectory = resolve(values["legacy-output"]);
  async function collectLegacy(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      // eslint-disable-next-line react-doctor/async-await-in-loop -- Depth-first insertion preserves deterministic legacy-route validation order.
      if (entry.isDirectory()) await collectLegacy(path);
      else if (entry.name.endsWith(".html")) {
        const pathname = `/${relative(legacyDirectory, path).split(sep).join("/")}`.replace(
          /index\.html$/,
          "",
        );
        if (pathname === "/404.html") continue;
        legacyRoutes.push(pathname);
        routes.add(pathname);
      }
    }
  }
  await collectLegacy(legacyDirectory);
}

function localUrl(value, requestPath) {
  // Explicit absolute links intentionally keep pointing at the live resource,
  // including legacy downloads hosted on the production origin.
  if (!value || /^(?:#|\/\/|[a-z][a-z0-9+.-]*:)/i.test(value)) return null;
  const url = new URL(value.replaceAll("&amp;", "&"), new URL(requestPath, origin));
  return url.origin === origin ? url : null;
}

function routeKey(url) {
  url.searchParams.sort();
  return `${url.pathname}${url.search}`;
}

function queryPath(url) {
  const hash = createHash("sha256").update(routeKey(url)).digest("hex").slice(0, 20);
  return `/__queries/${hash}/`;
}

function previewUrl(value, requestPath) {
  const url = localUrl(value, requestPath);
  if (!url) return value;
  const key = routeKey(url);
  const path = url.search && routes.has(key) ? queryPath(url) : `${url.pathname}${url.search}`;
  return `${prefix}${path}${url.hash}`;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function rewriteCss(css, requestPath) {
  return css.replace(
    /url\(\s*(["']?)([^)"']+)\1\s*\)/gi,
    (_, quote, url) => `url(${quote}${previewUrl(url.trim(), requestPath)}${quote})`,
  );
}

/** Skip scripts, comments and metadata. Only URL-bearing markup is rewritten. */
function rewriteHtml(html, requestPath) {
  return html.replace(
    /<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script\s*>|<style\b[\s\S]*?<\/style\s*>|<[a-z][^>]*>/gi,
    (tag) => {
      if (/^<!--/i.test(tag)) return tag;
      if (/^<style\b/i.test(tag)) return rewriteCss(tag, requestPath);
      if (/^<link\b/i.test(tag) && /(?<=\s)rel=["'](?:canonical|alternate)["']/i.test(tag)) return tag;
      const openingEnd = tag.indexOf(">") + 1;
      return (
        tag
          .slice(0, openingEnd)
          // `data-search-index` carries an address the overlay fetches, so it
          // moves under the preview prefix exactly as `href` and `src` do.
          .replace(
            /(?<=\s)(src|href|srcset|action|poster|style|data-search-index)=("[^"]*"|'[^']*')/gi,
            (_, name, quoted) => {
              const quote = quoted[0];
              const value = quoted.slice(1, -1);
              let rewritten;
              if (name.toLowerCase() === "style") rewritten = rewriteCss(value, requestPath);
              else if (name.toLowerCase() === "srcset") {
                if (value.includes("data:")) return `${name}=${quoted}`;
                rewritten = value
                  .split(",")
                  .map((candidate) => {
                    const [url, ...descriptor] = candidate.trim().split(/\s+/);
                    return [previewUrl(url, requestPath), ...descriptor].join(" ");
                  })
                  .join(", ");
              } else rewritten = previewUrl(value, requestPath);
              return `${name}=${quote}${rewritten}${quote}`;
            },
          ) + tag.slice(openingEnd)
      );
    },
  );
}

function destination(pathname) {
  const decoded = decodeURIComponent(pathname);
  assert(!decoded.includes("\\") && !decoded.split("/").includes(".."), "Unsafe output path");
  const path = extname(decoded) ? decoded : `${decoded.replace(/\/$/, "")}/index.html`;
  const result = resolve(output, `.${path}`);
  assert(result.startsWith(`${output}${sep}`), "Output path escapes destination");
  return result;
}

async function save(pathname, data) {
  const filename = destination(pathname);
  await mkdir(dirname(filename), { recursive: true });
  await writeFile(filename, data, { flag: "wx" });
}

const entryFilename = join(serverDirectory, "entry.mjs");
const productionEntry = await readFile(entryFilename, "utf8");
// Astro 7's standalone adapter bundles App and the manifest into entry.mjs, but
// exports only its Node handler. Expose that existing App in an isolated copy;
// its routes, renderer and middleware are byte-for-byte the production build.
assert(
  /\b(?:var|const|let) app = createApp\(/.test(productionEntry),
  "Unsupported Astro adapter bundle: expected its production App instance",
);
assert(
  productionEntry.includes('process.env.ASTRO_NODE_AUTOSTART !== "disabled"'),
  "Unsupported Astro adapter: no explicit autostart switch",
);
process.env.ASTRO_NODE_AUTOSTART = "disabled";
process.env.ASTRO_NODE_LOGGING = "disabled";
process.env.WEBSITE_MODE = "site";
const temporaryEntry = join(serverDirectory, `.preview-${randomUUID()}.mjs`);
let app;
try {
  await writeFile(temporaryEntry, `${productionEntry}\nexport { app as previewApp };\n`, { flag: "wx" });
  ({ previewApp: app } = await import(pathToFileURL(temporaryEntry).href));
} finally {
  await rm(temporaryEntry, { force: true });
}

const rendered = new Map();
const redirects = new Map();
const assertions = {
  privateEntriesReturn404: 0,
  redirectTargetsReturn200: 0,
  hiddenAbsentFromCollections: 0,
  htmlContentSecurityPolicy: 0,
  countdownFeedsReturn404: 0,
};
async function render(path) {
  const pathname = new URL(path, origin).pathname;
  if (pathname.startsWith("/media/") && pathname.endsWith(".html")) {
    try {
      const body = await readFile(resolve(clientDirectory, `.${pathname}`), "utf8");
      return { status: 200, headers: { "content-type": "text/html" }, body, staticAsset: true };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const response = await app.render(new Request(new URL(path, origin)), {
    // Error pages must remain in-process as well; this tool never fetches HTTP.
    prerenderedErrorPageFetch: () => Promise.resolve(new Response("Not found", { status: 404 })),
  });
  if (response.headers.get("content-type")?.includes("text/html")) {
    assert(
      response.headers.get("content-security-policy")?.includes("script-src"),
      `Missing production CSP at ${path}`,
    );
    assertions.htmlContentSecurityPolicy++;
  }
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers),
    body: await response.text(),
  };
}

try {
  process.env.WEBSITE_MODE = "countdown";
  for (const path of ["/feed.xml", "/feed.json"]) {
    // eslint-disable-next-line react-doctor/async-await-in-loop -- Finish each fail-fast guard check before changing the shared WEBSITE_MODE below.
    assert.equal((await render(path)).status, 404, `Countdown feed ${path} must not expose content`);
    assertions.countdownFeedsReturn404++;
  }
  process.env.WEBSITE_MODE = "site";
  for (const path of ["/__preview_missing_page__/", "/de/__preview_missing_page__/"]) {
    // eslint-disable-next-line react-doctor/async-await-in-loop -- Bound production renderer memory and report the first failing locale deterministically.
    const result = await render(path);
    assert.equal(result.status, 404, `Unknown route ${path} must return 404`);
    rendered.set(path, result);
  }
  for (const entry of excluded) {
    // eslint-disable-next-line react-doctor/async-await-in-loop -- Stop on the first private-content leak without scheduling more production renders.
    assert.equal((await render(entry.path)).status, 404, "A private entry must return 404");
    assertions.privateEntriesReturn404++;
  }
  for (const path of routes) {
    // eslint-disable-next-line react-doctor/async-await-in-loop -- Each response discovers redirect and pagination routes appended to this live Set.
    const result = await render(path);
    if ([301, 302, 303, 307, 308].includes(result.status)) {
      assert(result.headers.location, `Redirect ${path} has no Location`);
      const target = new URL(result.headers.location, new URL(path, origin));
      assert.equal(target.origin, origin, `Redirect ${path} leaves the local site`);
      redirects.set(path, routeKey(target));
      routes.add(routeKey(target));
    } else {
      assert.equal(result.status, 200, `Production route ${path} returned ${result.status}`);
      // Follow pagination exposed by the real page. No private entry paths are
      // introduced through this crawl; only listing query variants are added.
      for (const match of result.body.matchAll(/(?<=\s)href=["']([^"']+)["']/g)) {
        const url = localUrl(match[1], path);
        if (url?.search && /\/(?:posts|projects|topics(?:\/[^/]+)?|archive|search)\/$/.test(url.pathname))
          routes.add(routeKey(url));
      }
      const isCollection = /^\/(?:de\/)?(?:posts|projects|topics(?:\/[^/]+)?|archive|search)?\/?$/.test(
        new URL(path, origin).pathname,
      );
      if (isCollection || /\/(?:feed\.(?:xml|json)|sitemap\.xml)$/.test(path)) {
        for (const entry of hidden) {
          assert(
            !result.body.includes(`href="${entry.path}"`) && !result.body.includes(`${origin}${entry.path}`),
            `Hidden entry leaked into collection ${path}`,
          );
        }
        assertions.hiddenAbsentFromCollections++;
      }
    }
    rendered.set(path, result);
    assert(routes.size < 10000, "Unexpected unbounded route crawl");
  }
  for (const source of redirects.keys()) {
    let target = source;
    const seen = new Set();
    while (redirects.has(target)) {
      assert(!seen.has(target), `Redirect cycle at ${source}`);
      seen.add(target);
      target = redirects.get(target);
    }
    assert.equal(
      rendered.get(target)?.status,
      200,
      `Redirect ${source} does not finish at a rendered 200 response`,
    );
    assertions.redirectTargetsReturn200++;
  }

  // Validate first, then create the preview. Existing design-proposal files and
  // earlier previews are never overwritten or deleted by this command.
  await mkdir(output, { recursive: true });
  assert.equal(
    (await readdir(output)).length,
    0,
    "Preview destination must be empty; choose a new --out directory",
  );
  // Copy children individually because Node's errorOnExist also rejects the
  // empty destination directory whose contents were checked above.
  for (const child of await readdir(clientDirectory)) {
    // Migration media may also belong to private entries. Copy only assets
    // actually referenced by a rendered public/hidden document below.
    if (child === "media") continue;
    // eslint-disable-next-line react-doctor/async-await-in-loop -- Keep fail-fast output mutations ordered so a copy failure leaves a deterministic partial export.
    await cp(join(clientDirectory, child), join(output, child), {
      recursive: true,
      force: false,
      errorOnExist: true,
    });
  }
  const referencedMedia = new Set();
  for (const [requestPath, result] of rendered) {
    if (!result.headers["content-type"]?.includes("text/html")) continue;
    for (const tag of result.body.matchAll(/<[a-z][^>]*>/gi)) {
      for (const attribute of tag[0].matchAll(/(?<=\s)(src|href|srcset|poster)=("[^"]*"|'[^']*')/gi)) {
        const value = attribute[2].slice(1, -1);
        const urls =
          attribute[1].toLowerCase() === "srcset"
            ? value.split(",").map((candidate) => candidate.trim().split(/\s+/)[0])
            : [value];
        for (const candidate of urls) {
          const url = localUrl(candidate, requestPath);
          if (url?.pathname.startsWith("/media/")) referencedMedia.add(url.pathname);
        }
      }
    }
  }
  for (const mediaPath of referencedMedia) {
    if (rendered.has(mediaPath)) continue;
    const target = destination(mediaPath);
    await mkdir(dirname(target), { recursive: true });
    await cp(resolve(clientDirectory, `.${mediaPath}`), target, { force: false, errorOnExist: true });
  }
  async function rewriteAssets(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await rewriteAssets(path);
      else if (entry.name.endsWith(".css")) {
        const requestPath = `/${relative(output, path).split(sep).join("/")}`;
        await writeFile(path, rewriteCss(await readFile(path, "utf8"), requestPath));
      } else if (entry.name.startsWith("preload-helper.") && entry.name.endsWith(".js")) {
        await writeFile(path, rewritePreloadHelper(await readFile(path, "utf8"), `${prefix}/`));
      }
    }
  }
  await rewriteAssets(output);
  for (const [path, result] of rendered) {
    const url = new URL(path, origin);
    const pathname = url.search ? queryPath(url) : url.pathname;
    if (redirects.has(path)) {
      const target = escapeHtml(previewUrl(redirects.get(path), path));
      await save(
        pathname,
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=${target}"><title>Redirect</title></head><body><a href="${target}">Continue</a></body></html>`,
      );
    } else {
      const html = result.headers["content-type"]?.includes("text/html");
      await save(pathname, html ? rewriteHtml(result.body, path) : result.body);
    }
  }
  const report = {
    generatedAt: new Date().toISOString(),
    rendering: "Production Astro App.render(Request), no listener",
    assertions,
    legacyRoutesChecked: legacyRoutes.length,
    pages: available.length,
    rendered: [...rendered].map(([path, result]) => ({
      path,
      status: result.status,
      bytes: Buffer.byteLength(result.body),
      source: result.staticAsset ? "production-client-file" : "astro-response",
    })),
    queryPages: [...routes]
      .filter((path) => path.includes("?"))
      .map((path) => ({ request: path, preview: `${prefix}${queryPath(new URL(path, origin))}` })),
    limitations: [
      "The static preview cannot dispatch arbitrary search form queries. The listed query snapshots are real SSR responses; use the actual SSR site for other queries.",
      "The static host serves saved 404 and redirect documents as files. Real 404/redirect status codes and response headers are checked by App.render, not reproduced by the static host.",
      "Static-page performance measurements exclude live SSR request latency.",
    ],
  };
  await save("/preview-report.json", `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify({
      output,
      pages: available.length,
      rendered: rendered.size,
      ...assertions,
      report: join(output, "preview-report.json"),
    }),
  );
} finally {
  await app.logger?.close();
}
