import { loadProductionApp } from "./production-app.mjs";

/**
 * Renders addresses of the production build against one snapshot, as the
 * backend would serve it, and restores the environment afterwards.
 *
 * The site holds the content it loaded for 30 seconds, in modules every load of
 * the build shares within one process. A test file therefore renders one
 * snapshot only; a second snapshot belongs in a file of its own, which
 * `node --test` runs in a process of its own.
 *
 * @param {unknown} snapshot - What the backend answers for `/content/snapshot`.
 * @param {string[]} paths - The addresses to render.
 * @returns {Promise<string[]>} Each page's HTML, in the order of `paths`.
 */
export async function renderPages(snapshot, paths) {
  const saved = { fetch: globalThis.fetch, url: process.env.API_URL, mode: process.env.WEBSITE_MODE };
  process.env.API_URL = "https://fixture.example.test";
  process.env.WEBSITE_MODE = "site";
  globalThis.fetch = async () => Response.json(snapshot);
  try {
    const app = await loadProductionApp(new URL("../dist/server", import.meta.url).pathname);
    const pages = [];
    for (const path of paths)
      pages.push(await (await app.render(new Request(`https://layered.work${path}`))).text());
    return pages;
  } finally {
    globalThis.fetch = saved.fetch;
    for (const [key, value] of [
      ["API_URL", saved.url],
      ["WEBSITE_MODE", saved.mode],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

/** The preload the head carries for a picture. */
export const IMAGE_PRELOAD = /<link rel="preload" as="image"[^>]*>/;

/** The picture a page draws first, which is the one it marks as urgent. */
export const OPENING_PICTURE = /<img[^>]*fetchpriority="high"[^>]*>/;

/**
 * One attribute of the first element matching a pattern, as the page wrote it.
 *
 * @param {string} html - Where to look.
 * @param {RegExp} element - What the element's opening tag looks like.
 * @param {string} name - The attribute.
 * @returns {string | undefined} Its value, or nothing when the element or the attribute is absent.
 */
export function attributeOf(html, element, name) {
  const tag = element.exec(html)?.[0] ?? "";
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
}

/** The page's head and its body, apart. */
export function headAndBody(html) {
  return { head: html.slice(0, html.indexOf("</head>")), body: html.slice(html.indexOf("<body")) };
}

/**
 * A published entry for a fixture snapshot, with every field the site requires.
 *
 * @param {Record<string, unknown>} fields - What this entry says differently.
 */
export function fixtureEntry(fields) {
  return {
    title: "Entry title",
    slug: String(fields.id),
    language: "en",
    kind: "post",
    visibility: "public",
    body: "A paragraph.",
    topics: [],
    publishedAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
    ...fields,
  };
}

/**
 * A picture for a fixture snapshot, with three candidates.
 *
 * @param {string} slug - Its name, which also names its files.
 */
export function fixturePicture(slug) {
  return {
    slug,
    src: `/media/${slug}.jpg`,
    mime: "image/webp",
    width: 1600,
    height: 1200,
    srcSet: `/media/${slug}-480.webp 480w, /media/${slug}-960.webp 960w, /media/${slug}-1600.webp 1600w`,
  };
}
