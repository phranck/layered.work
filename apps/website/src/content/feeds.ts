import { SITE_ORIGIN } from "../site.js";
import { type ContentRepository, summaryOf, topicPath } from "./repository.js";

export function xml(value: string): string {
  return value.replace(
    /[<>&"']/g,
    (character) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[character] ?? character,
  );
}
/**
 * Every post and project in both languages, newest first, each once: an entry
 * listed in the other language as well appears in both lists and in the feed
 * a single time.
 */
function feedEntries(repository: ContentRepository) {
  const byPath = new Map(
    [...repository.publicEntries("en"), ...repository.publicEntries("de")].map((entry) => [
      entry.path,
      entry,
    ]),
  );
  return [...byPath.values()]
    .filter((entry) => entry.kind !== "page")
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}
export function jsonFeed(repository: ContentRepository) {
  return {
    version: "https://jsonfeed.org/version/1.1",
    title: "LAYERED.work",
    home_page_url: SITE_ORIGIN,
    feed_url: `${SITE_ORIGIN}/feed.json`,
    items: feedEntries(repository).map((entry) => ({
      id: new URL(entry.path, SITE_ORIGIN).href,
      url: new URL(entry.path, SITE_ORIGIN).href,
      title: entry.title,
      content_text: summaryOf(entry),
      language: entry.language,
      date_published: entry.publishedAt ?? undefined,
      date_modified: entry.updatedAt ?? undefined,
    })),
  };
}
export function rssFeed(repository: ContentRepository): string {
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>LAYERED.work</title><link>${SITE_ORIGIN}/</link><description>Enclosures, circuit boards and software</description>${feedEntries(
    repository,
  )
    .map(
      (entry) =>
        `<item><title>${xml(entry.title)}</title><link>${xml(new URL(entry.path, SITE_ORIGIN).href)}</link><guid>${xml(new URL(entry.path, SITE_ORIGIN).href)}</guid><description>${xml(summaryOf(entry))}</description>${entry.publishedAt ? `<pubDate>${new Date(entry.publishedAt).toUTCString()}</pubDate>` : ""}</item>`,
    )
    .join("")}</channel></rss>`;
}

/**
 * The sitemap document for a set of site-relative paths, each listed once.
 *
 * @param paths - Site-relative paths; duplicates are dropped.
 * @returns The XML document, with every address made absolute against the site origin.
 */
export function sitemap(paths: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...new Set(paths)].map((path) => `<url><loc>${xml(new URL(path, SITE_ORIGIN).href)}</loc></url>`).join("")}</urlset>`;
}

/**
 * Every address the site offers to search engines once it is open.
 *
 * Built from `publicEntries`, like the feeds, the listings and the search index,
 * so a hidden entry stays reachable at its own address and is named nowhere a
 * crawler reads. A topic appears only whilst a public entry carries it.
 *
 * @param repository - The site's content.
 * @returns The two language roots, then each language's public entries and topics.
 */
export function sitemapPaths(repository: ContentRepository): string[] {
  return [
    "/",
    "/de/",
    ...(["en", "de"] as const).flatMap((language) => [
      ...repository.publicEntries(language).map((entry) => entry.path),
      ...repository.topics(language).map((topic) => topicPath(language, topic.slug)),
    ]),
  ];
}
