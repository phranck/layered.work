import { renderContent } from "@layered/content";
import { ContentRenderer } from "@layered/ui";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { COPY, SITE_ORIGIN, TAGLINE } from "../site.js";
import { collectionPaths, languageLinks } from "./language-links.js";
import {
  type ContentRepository,
  type Entry,
  type Language,
  languageRoot,
  summaryOf,
  topicPath,
} from "./repository.js";

export function xml(value: string): string {
  return value.replace(
    /[<>&"']/g,
    (character) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[character] ?? character,
  );
}
/**
 * Public posts/projects for one language, including explicitly shared untranslated entries.
 */
function feedEntries(repository: ContentRepository, language: Language) {
  return repository.publicEntries(language).filter((entry) => entry.kind !== "page");
}
const author = { name: COPY.author, url: `${SITE_ORIGIN}/` };
const absolute = (path: string) => new URL(path, SITE_ORIGIN).href;
const feedDescription = (repository: ContentRepository, language: Language) =>
  repository.siteFrame()?.footerLine[language].trim() || TAGLINE;

/** The same safe body renderer as the article, with absolute links for readers outside this site. */
function feedHtml(repository: ContentRepository, entry: Entry): string {
  return renderToStaticMarkup(
    createElement(ContentRenderer, {
      nodes: renderContent(entry.body, { language: entry.language }),
      media: (slug) => {
        const asset = repository.media(slug);
        if (!asset) return undefined;
        const poster = entry.featuredImage ? repository.media(entry.featuredImage)?.src : undefined;
        return {
          ...asset,
          src: absolute(asset.src),
          ...(poster ? { poster: absolute(poster) } : {}),
          ...(asset.srcSet
            ? {
                srcSet: asset.srcSet
                  .split(",")
                  .map((candidate) => {
                    const [src, width] = candidate.trim().split(/\s+/);
                    return `${absolute(src ?? "")}${width ? ` ${width}` : ""}`;
                  })
                  .join(", "),
              }
            : {}),
        };
      },
      resolveUrl: (url) => new URL(repository.contentUrl(url), absolute(entry.path)).href,
    }),
  );
}

export function jsonFeed(repository: ContentRepository, language: Language = "en") {
  return {
    version: "https://jsonfeed.org/version/1.1",
    title: repository.siteFrame()?.title[language] ?? "LAYERED.work",
    description: feedDescription(repository, language),
    home_page_url: absolute(languageRoot(language)),
    feed_url: absolute(`${languageRoot(language)}feed.json`),
    language,
    author,
    authors: [author],
    icon: absolute("/logo.svg"),
    items: feedEntries(repository, language).map((entry) => ({
      id: absolute(entry.path),
      url: absolute(entry.path),
      title: entry.title,
      summary: summaryOf(entry),
      content_html: feedHtml(repository, entry),
      content_text: summaryOf(entry),
      author,
      authors: [author],
      tags: repository.entryTopics(entry, entry.language).map((topic) => topic.name),
      image: entry.featuredImage
        ? absolute(repository.media(entry.featuredImage)?.src ?? "/logo.svg")
        : undefined,
      language: entry.language,
      date_published: entry.publishedAt ?? undefined,
      date_modified: entry.updatedAt ?? undefined,
    })),
  };
}
export function rssFeed(repository: ContentRepository, language: Language = "en"): string {
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>${xml(repository.siteFrame()?.title[language] ?? "LAYERED.work")}</title><link>${absolute(languageRoot(language))}</link><description>${xml(feedDescription(repository, language))}</description><language>${language}</language><atom:link href="${absolute(`${languageRoot(language)}feed.xml`)}" rel="self" type="application/rss+xml" />${feedEntries(
    repository,
    language,
  )
    .map(
      (entry) =>
        `<item xml:lang="${entry.language}"><title>${xml(entry.title)}</title><link>${xml(absolute(entry.path))}</link><guid isPermaLink="true">${xml(absolute(entry.path))}</guid><description>${xml(summaryOf(entry))}</description><content:encoded>${xml(feedHtml(repository, entry))}</content:encoded><dc:creator>${xml(author.name)}</dc:creator>${repository
          .entryTopics(entry, entry.language)
          .map((topic) => `<category>${xml(topic.name)}</category>`)
          .join(
            "",
          )}${entry.publishedAt ? `<pubDate>${new Date(entry.publishedAt).toUTCString()}</pubDate>` : ""}</item>`,
    )
    .join("")}</channel></rss>`;
}

/**
 * The sitemap document for a set of site-relative paths, each listed once.
 *
 * @param paths - Site-relative paths; duplicates are dropped.
 * @returns The XML document, with every address made absolute against the site origin.
 */
export function sitemap(paths: string[], repository?: ContentRepository): string {
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${[
    ...new Set(paths),
  ]
    .map((path) => {
      const links = repository ? languageLinks(repository, path) : [];
      return `<url><loc>${xml(absolute(path))}</loc>${links.map((link) => `<xhtml:link rel="alternate" hreflang="${link.language}" href="${xml(absolute(link.path))}" />`).join("")}</url>`;
    })
    .join("")}</urlset>`;
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
    ...new Set([
      ...collectionPaths,
      ...(["en", "de"] as const).flatMap((language) => [
        ...repository.publicEntries(language).map((entry) => entry.path),
        ...repository.topics(language).map((topic) => topicPath(language, topic.slug)),
      ]),
    ]),
  ];
}
