/**
 * Compares every entry the site renders with the page the old Publii site
 * served for it, and checks every link and every file the rendered page names.
 *
 * WEBSITE_CONTENT_FILE=/absolute/snapshot.json node tools/verify-migration.mjs [--legacy-output <dir>]
 *
 * The snapshot is the one `pnpm --filter @layered/backend db:verify
 * --snapshot-out` writes from the database, so what is rendered is what the
 * database holds. Rendering goes through the production build in this process,
 * with no listener and no request leaving the machine. A dummy media origin
 * exercises the deployment's URL mapping; files are checked against local
 * source bytes.
 *
 * It prints a table per entry and every run of words found on one side only.
 * Unresolved links, missing files and pages that do not answer 200 fail the
 * run. A text difference does not, because some are intended, and each one is
 * explained where the result is recorded.
 */
import assert from "node:assert/strict";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { LISTING_PATHS } from "@layered/schemas";
import { Window } from "happy-dom";
import { migrationMedia } from "./migration-media.mjs";
import { migratedOverviewPages } from "./migration-overviews.mjs";
import { visibleText, wordRuns, words } from "./migration-text.mjs";
import { loadProductionApp } from "./production-app.mjs";
import { missingResponsiveImages } from "./responsive-images.mjs";

const { values } = parseArgs({
  options: {
    "legacy-output": {
      type: "string",
      default: join(homedir(), "Documents/Publii/sites/layeredwork/output"),
    },
    "media-paths-out": { type: "string" },
  },
});
assert(process.env.WEBSITE_CONTENT_FILE, "WEBSITE_CONTENT_FILE must name the snapshot to render");

/** How many redirects a link may pass through before it counts as a loop. */
const MAX_REDIRECTS = 10;

/** Where the old site's body sat, and where this site's sits. */
const LEGACY_BODY = ".content__entry";
const RENDERED_BODY = ".content-prose";
const RENDERED_ARTICLE = ".article-body";

/** What `packages/ui/src/content-placeholder.tsx` renders for a file it cannot find. */
const UNAVAILABLE = ".content-placeholder";

/**
 * Whether a rendered element belongs to the page rather than to the entry.
 *
 * A code block here carries a bar naming its language and a gutter of line
 * numbers, and neither was ever written by the author. The gutter is hidden
 * from assistive technology already, so that is the test for it; the bar is the
 * code block's caption.
 */
function isFurniture(element) {
  return element.getAttribute("aria-hidden") === "true" || element.matches(".content-code > figcaption");
}

/** Old directories that hold listings rather than entries. */
const LEGACY_LISTINGS = new Set(["tags", "page", "authors"]);

const origin = "https://layered.work";
const mediaOrigin = "https://migration-media.invalid";
const appDirectory = fileURLToPath(new URL("../", import.meta.url));
const clientDirectory = join(appDirectory, "dist/client");

// The file and nothing else: an API_URL would make the site read whatever
// backend it names. The dummy media origin checks production URL mapping
// without asking the actual bucket for any file.
delete process.env.API_URL;
process.env.MEDIA_ORIGIN = mediaOrigin;
process.env.WEBSITE_MODE = "site";

const snapshot = JSON.parse(await readFile(resolve(process.env.WEBSITE_CONTENT_FILE), "utf8"));
const app = await loadProductionApp(join(appDirectory, "dist/server"));
const window = new Window({
  settings: {
    disableJavaScriptEvaluation: true,
    disableJavaScriptFileLoading: true,
    disableCSSFileLoading: true,
  },
});

/** Parses a page without running anything in it. */
function parse(html) {
  return new window.DOMParser().parseFromString(html, "text/html");
}

/** Renders one address, following redirects, and says where it ended. */
async function resolveAddress(address) {
  let current = address;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    // eslint-disable-next-line react-doctor/async-await-in-loop -- Each hop depends on the previous response's Location.
    const response = await app.render(new Request(new URL(current, origin)), {
      prerenderedErrorPageFetch: () => Promise.resolve(new Response("Not found", { status: 404 })),
    });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      const next = new URL(location, new URL(current, origin));
      if (next.origin !== origin) return { status: response.status, path: next.href, body: "" };
      current = `${next.pathname}${next.search}`;
      continue;
    }
    return { status: response.status, path: current, body: await response.text() };
  }
  return { status: 0, path: current, body: "" };
}

/** Every old page that shows one entry, by the last segment of its address. */
async function legacyPages(root, directory = root, found = new Map()) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    const segments = relative(root, path).split(sep);
    if (item.isDirectory() && !LEGACY_LISTINGS.has(segments[0] ?? "")) await legacyPages(root, path, found);
    else if (item.name === "index.html" && segments.length > 1) found.set(segments.at(-2), path);
  }
  return found;
}

const legacy = await legacyPages(resolve(values["legacy-output"]));
const localMediaRoot = resolve(appDirectory, "../../", process.env.MEDIA_LOCAL_DIR ?? "media-local");
const media = migrationMedia(snapshot.media, { localRoot: localMediaRoot, clientRoot: clientDirectory });
// Sorted, because a database returns rows in no promised order and two runs
// over the same content should print the same report.
const readable = [
  ...snapshot.entries.filter((entry) => ["public", "hidden"].includes(entry.visibility)),
  ...migratedOverviewPages(snapshot.entries, legacy, LISTING_PATHS),
].sort((one, other) => one.path.localeCompare(other.path));
const results = [];
const renderedMediaPaths = new Set();

/** Media paths named by a rendered page, including responsive candidates. */
function mediaPathsIn(root, pagePath) {
  const found = new Set();
  for (const element of root.querySelectorAll("*")) {
    for (const attribute of element.attributes) {
      for (const candidate of attribute.value.split(/[\s,]+/)) {
        if (!candidate.includes("/")) continue;
        const url = new URL(candidate, new URL(pagePath, origin));
        if ((url.origin === origin || url.origin === mediaOrigin) && media.isMediaPath(url.pathname)) {
          found.add(url.pathname);
        }
      }
    }
  }
  return found;
}

for (const entry of readable) {
  const problems = [];
  // eslint-disable-next-line react-doctor/async-await-in-loop -- One page at a time keeps the production renderer's memory bounded.
  const page = await resolveAddress(entry.path);
  if (page.status !== 200) problems.push(`answers ${page.status}`);
  const document = parse(page.body);
  const prose = document.querySelector(RENDERED_BODY);
  if (!prose) problems.push("no rendered body");
  const article = document.querySelector(RENDERED_ARTICLE) ?? prose ?? document.body;
  problems.push(...missingResponsiveImages(article, snapshot.media, new URL(entry.path, origin)));

  const legacyFile = legacy.get(entry.slug);
  const legacyBody = legacyFile
    ? parse(await readFile(legacyFile, "utf8")).querySelector(LEGACY_BODY)
    : undefined;

  const before = legacyBody ? words(visibleText(legacyBody)) : [];
  const after = prose ? words(visibleText(prose, isFurniture)) : [];
  const runs = legacyBody && prose ? wordRuns(before, after) : [];

  // Links in the body. An anchor on the page must exist on it, an internal
  // address must end at 200, and a file must match the local source.
  let linksChecked = 0;
  for (const anchor of prose?.querySelectorAll("a[href]") ?? []) {
    const href = anchor.getAttribute("href");
    const url = new URL(href, new URL(entry.path, origin));
    if (url.origin === mediaOrigin) {
      linksChecked++;
      renderedMediaPaths.add(url.pathname);
      // eslint-disable-next-line react-doctor/async-await-in-loop -- Sequential file reads keep the report in reading order.
      const problem = await media.inspect(url.pathname);
      if (problem) problems.push(problem);
      continue;
    }
    if (url.origin !== origin) continue;
    linksChecked++;
    if (media.isMediaPath(url.pathname)) {
      // eslint-disable-next-line react-doctor/async-await-in-loop -- Sequential file reads keep the report in reading order.
      const problem = await media.inspect(url.pathname);
      if (problem) problems.push(problem);
      continue;
    }
    const samePage = url.pathname === new URL(entry.path, origin).pathname;
    // eslint-disable-next-line react-doctor/async-await-in-loop -- Sequential renders keep the report in reading order.
    const target = samePage
      ? { status: 200, body: page.body }
      : await resolveAddress(`${url.pathname}${url.search}`);
    if (target.status !== 200) problems.push(`link ${href} answers ${target.status}`);
    else if (url.hash && !parse(target.body).getElementById(decodeURIComponent(url.hash.slice(1)))) {
      problems.push(`link ${href} names an anchor the page does not have`);
    }
  }

  // A component whose file the library does not hold renders a placeholder
  // rather than failing the page, so the placeholder is what gives it away.
  for (const placeholder of article.querySelectorAll(UNAVAILABLE)) {
    problems.push(`renders a placeholder: ${placeholder.textContent.trim()}`);
  }

  // Every file the article names, from the cover to the last figure, whatever
  // attribute carries it: `src`, `srcset`, `poster`, or a model's source.
  const mediaPaths = mediaPathsIn(article, entry.path);
  for (const path of mediaPaths) {
    renderedMediaPaths.add(path);
    // eslint-disable-next-line react-doctor/async-await-in-loop -- Sequential file reads keep the report in reading order.
    const problem = await media.inspect(path);
    if (problem) problems.push(problem);
  }

  results.push({
    slug: entry.slug,
    path: entry.path,
    legacy: legacyFile
      ? `/${relative(resolve(values["legacy-output"]), legacyFile).replace(/index\.html$/, "")}`
      : null,
    renderedBody: Boolean(prose),
    wordsBefore: before.length,
    wordsAfter: after.length,
    missing: runs.filter((run) => run.kind === "missing").reduce((total, run) => total + run.words.length, 0),
    added: runs.filter((run) => run.kind === "added").reduce((total, run) => total + run.words.length, 0),
    imagesBefore: legacyBody?.querySelectorAll("img").length ?? 0,
    imagesAfter: prose?.querySelectorAll("img").length ?? 0,
    linksChecked,
    mediaChecked: mediaPaths.size,
    runs,
    problems,
  });
}

console.log(
  "| Entry | Old page | Words before | Words after | Missing | Added | Images before | Images after | Links | Files | Problems |",
);
console.log("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |");
for (const result of results) {
  console.log(
    `| \`${result.path}\` | ${result.legacy ? `\`${result.legacy}\`` : "none"} | ${result.wordsBefore} | ${result.wordsAfter} | ${result.missing} | ${result.added} | ${result.imagesBefore} | ${result.imagesAfter} | ${result.linksChecked} | ${result.mediaChecked} | ${result.problems.join("; ") || (result.renderedBody ? "" : "no rendered body")} |`,
  );
}
for (const result of results.filter((item) => item.runs.length > 0)) {
  console.log(`\n### ${result.path}\n`);
  for (const run of result.runs) console.log(`- ${run.kind}: ${run.words.join(" ")}`);
}

const failed = results.filter((result) => result.problems.length > 0);
const home = await resolveAddress("/");
const homeDocument = home.status === 200 ? parse(home.body) : null;
const homeProblems = homeDocument
  ? missingResponsiveImages(homeDocument, snapshot.media, origin)
  : [`home page answers ${home.status}`];
for (const path of homeDocument ? mediaPathsIn(homeDocument, "/") : []) {
  renderedMediaPaths.add(path);
  const problem = await media.inspect(path);
  if (problem) homeProblems.push(problem);
}
console.log(`Home page responsive images: ${homeProblems.join("; ") || "ok"}.`);
console.log(
  `\n${results.length} entries rendered, ${results.reduce((total, item) => total + item.linksChecked, 0)} internal links and ${results.reduce((total, item) => total + item.mediaChecked, 0)} files checked, ${failed.length} with problems.`,
);
process.exitCode = failed.length > 0 || homeProblems.length > 0 ? 1 : 0;
if (failed.length === 0 && homeProblems.length === 0 && values["media-paths-out"]) {
  await writeFile(
    resolve(values["media-paths-out"]),
    `${JSON.stringify([...renderedMediaPaths].sort(), null, 2)}\n`,
  );
}
await app.logger?.close();
