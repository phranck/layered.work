import { SITE_ORIGIN } from "../site.js";
import { type ContentRepository, summaryOf } from "./repository.js";

export function xml(value: string): string {
  return value.replace(
    /[<>&"']/g,
    (character) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[character] ?? character,
  );
}
function feedEntries(repository: ContentRepository) {
  return [...repository.publicEntries("en"), ...repository.publicEntries("de")]
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
