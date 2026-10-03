import { z } from "zod";
import { CONTENT_LANGUAGES, ENTRY_KINDS, PUBLICATION_STATES } from "./entries.js";
import { MaxLength, text } from "./request.js";

/**
 * Searching the dashboard from a screen that has no list of its own.
 *
 * One request looks through entries of every kind, by title and by topic, and
 * through the media library, by slug and by alt text.
 */

/** What the reader typed. */
export const searchQuery = z.strictObject({ q: text(MaxLength.Line) });
export type SearchQuery = z.infer<typeof searchQuery>;

/** One language of one entry that matched. */
export const entrySearchHit = z.object({
  /** The translation, which is what opening it opens. */
  id: z.uuid(),
  kind: z.enum(ENTRY_KINDS),
  title: z.string(),
  language: z.enum(CONTENT_LANGUAGES),
  state: z.enum(PUBLICATION_STATES),
});
export type EntrySearchHit = z.infer<typeof entrySearchHit>;

/** One file of the library that matched. */
export const mediaSearchHit = z.object({
  id: z.uuid(),
  slug: z.string(),
  /** Where its picture can be shown from, for a raster image. */
  thumbnailUrl: z.string().nullable(),
  /** The alt text that matched or, failing that, the first one written. */
  altText: z.string().nullable(),
});
export type MediaSearchHit = z.infer<typeof mediaSearchHit>;

/** What a search found, each part capped at `SEARCH_HIT_LIMIT`, newest or alphabetical first. */
export const searchResults = z.object({
  entries: z.array(entrySearchHit),
  media: z.array(mediaSearchHit),
});
export type SearchResults = z.infer<typeof searchResults>;

/** How many hits of each kind a search returns, which is more than a dialog can show at once. */
export const SEARCH_HIT_LIMIT = 20;
