import { z } from "zod";
import type { ContentLanguage } from "./entries.js";
import { body, MaxLength } from "./request.js";

/**
 * Pictures from Unsplash in the media library.
 *
 * Unsplash's API guidelines decide most of what is here: a photo is hotlinked
 * from the address the API gives rather than copied, using one counts as a
 * download Unsplash is told about, and wherever it is shown, the photographer
 * and Unsplash are credited with links that carry referral parameters. The
 * access key stays on the server, so the dashboard asks the API and the API
 * asks Unsplash.
 */

/** An Unsplash photo id as the API writes it. Bounded so a forged one costs nothing to refuse. */
export const unsplashPhotoId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

/** Searching Unsplash from the media browser. */
export const unsplashSearchQuery = z.object({
  query: z.string().trim().min(1).max(MaxLength.Line),
  page: z.coerce.number().int().min(1).max(100).default(1),
});
export type UnsplashSearchQuery = z.infer<typeof unsplashSearchQuery>;

/** One search result, as much of it as the browser shows and an import needs. */
export const unsplashSearchItem = z.object({
  id: unsplashPhotoId,
  /** A small hotlinked preview of the photo. */
  thumbnailUrl: z.url(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** Unsplash's own description of the photo, where it has one. */
  description: z.string().nullable(),
  photographer: z.string(),
});
export type UnsplashSearchItem = z.infer<typeof unsplashSearchItem>;

/** One page of search results. */
export const unsplashSearchPage = z.object({
  items: z.array(unsplashSearchItem),
  page: z.number().int().positive(),
  hasMore: z.boolean(),
});
export type UnsplashSearchPage = z.infer<typeof unsplashSearchPage>;

/** Taking one result into the library. Everything else about the photo is read from Unsplash. */
export const importUnsplashBody = body({ photoId: unsplashPhotoId });
export type ImportUnsplashBody = z.infer<typeof importUnsplashBody>;

/** Who took a library picture that comes from Unsplash. */
export const mediaCredit = z.object({
  photographer: z.string(),
  /** The photographer's Unsplash profile, without the referral parameters. */
  profileUrl: z.url(),
});
export type MediaCredit = z.infer<typeof mediaCredit>;

/** The `utm_source` every link to Unsplash carries, naming this site as the guidelines ask. */
export const UNSPLASH_UTM_SOURCE = "layered_work";

/** Unsplash's own address, which every credit links next to the photographer. */
export const UNSPLASH_HOME = "https://unsplash.com/";

/**
 * A link to Unsplash with the referral parameters its guidelines require.
 *
 * Built with the URL API, so an address that already carries a query keeps it.
 *
 * @param address - An address on `unsplash.com`, such as a photographer's profile.
 * @returns The same address with `utm_source` and `utm_medium=referral`.
 */
export function unsplashReferral(address: string): string {
  const url = new URL(address);
  url.searchParams.set("utm_source", UNSPLASH_UTM_SOURCE);
  url.searchParams.set("utm_medium", "referral");
  return url.href;
}

/** The words of an Unsplash credit in each language, in the form Unsplash recommends. */
const CREDIT_WORDS: Record<ContentLanguage, { lead: string; joiner: string }> = {
  en: { lead: "Photo by", joiner: "on" },
  de: { lead: "Foto von", joiner: "auf" },
};

/**
 * An Unsplash credit worded for one language, as one sentence of four parts:
 * "Photo by", the photographer, "on", Unsplash. Both names link, and both links
 * carry the referral parameters.
 *
 * The site and the dashboard both word it from here, so the two say the same.
 *
 * @param credit - Who took the photo.
 * @param language - The language of the page or the interface showing it.
 */
export function unsplashCreditLine(credit: MediaCredit, language: ContentLanguage) {
  return {
    ...CREDIT_WORDS[language],
    author: credit.photographer,
    authorUrl: unsplashReferral(credit.profileUrl),
    source: "Unsplash",
    sourceUrl: unsplashReferral(UNSPLASH_HOME),
  };
}
