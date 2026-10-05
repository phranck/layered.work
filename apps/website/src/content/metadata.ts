import { COPY, SITE_ORIGIN, TAGLINE } from "../site.js";
import { type ContentRepository, type Entry, readingTime, summaryOf } from "./repository.js";

export interface SocialImage {
  url: string;
  width?: number;
  height?: number;
  alt: string;
}
const absolute = (url: string) => new URL(url, SITE_ORIGIN).href;
const raster = /^image\/(?:jpeg|png|webp|avif|gif)$/;

/** Metadata reads the same entry and media as the article, never a second content projection. */
export function pageMetadata(
  repository: ContentRepository | undefined,
  entry: Entry | undefined,
  description?: string,
) {
  const own = entry?.featuredImage ? repository?.media(entry.featuredImage) : undefined;
  const generated = entry?.socialImage ? repository?.media(entry.socialImage) : undefined;
  const picture =
    own && (raster.test(own.mime ?? "") || (!own.mime && /\.(?:jpe?g|png|webp|avif|gif)$/i.test(own.src)))
      ? own
      : generated;
  const fallback = repository?.siteFrame()?.socialImage;
  const image: SocialImage = picture
    ? {
        url: absolute(picture.src),
        width: picture.width,
        height: picture.height,
        alt: entry?.title ?? "LAYERED.work",
      }
    : {
        url: absolute(fallback ? (repository?.contentUrl(fallback) ?? fallback) : "/og.png"),
        ...(!fallback ? { width: 1200, height: 630 } : {}),
        alt: "LAYERED.work",
      };
  const publicDescription = entry
    ? entry.visibility === "public"
      ? summaryOf(entry)
      : ""
    : description?.trim() || TAGLINE;
  const article =
    entry?.visibility === "public" && entry.kind !== "page"
      ? {
          "@context": "https://schema.org",
          "@type": "Article",
          headline: entry.title,
          description: publicDescription,
          mainEntityOfPage: absolute(entry.path),
          url: absolute(entry.path),
          image: image.url,
          inLanguage: entry.language,
          datePublished: entry.publishedAt ?? undefined,
          dateModified: entry.updatedAt ?? entry.publishedAt ?? undefined,
          timeRequired: `PT${readingTime(entry)}M`,
          author: { "@type": "Person", name: COPY.author, url: absolute("/") },
        }
      : undefined;
  return { description: publicDescription, image, article };
}
