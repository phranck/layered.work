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

/** Public search never returns bodies or editorial state. */
export const publicSearchQuery = z.strictObject({
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Reject controls at the public request boundary.
  q: text(120, { pattern: /^[^\u0000-\u001f\u007f]+$/ }),
  language: z.enum(CONTENT_LANGUAGES),
  page: z.coerce.number().int().min(1).max(9999).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(6),
});
export type PublicSearchQuery = z.infer<typeof publicSearchQuery>;
export const publicSearchHit = z.object({
  path: z.string().regex(/^\/(?:[a-zA-Z0-9_-]+\/)*$/),
  title: z.string(),
  kind: z.enum(ENTRY_KINDS),
  language: z.enum(CONTENT_LANGUAGES),
});
export type PublicSearchHit = z.infer<typeof publicSearchHit>;
export const publicSearchResults = z.object({
  entries: z.array(publicSearchHit),
  total: z.number().int().nonnegative(),
});
export type PublicSearchResults = z.infer<typeof publicSearchResults>;
