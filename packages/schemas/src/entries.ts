import { z } from "zod";

/**
 * Entries as the dashboard lists them.
 *
 * The three closed sets below are declared here once. The database's enums read
 * them, and so do the dashboard's filters and badges, so a fourth state is one
 * change rather than three that have to agree.
 */

/** What an entry is: a post in the dated listings, a page that stands alone, or a project. */
export const ENTRY_KINDS = ["post", "page", "project"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

/** How far a translation has got, and who may read it. */
export const PUBLICATION_STATES = ["public", "draft", "hidden"] as const;
export type PublicationState = (typeof PUBLICATION_STATES)[number];

/** The languages the site is written in. */
export const CONTENT_LANGUAGES = ["en", "de"] as const;
export type ContentLanguage = (typeof CONTENT_LANGUAGES)[number];

/** Which entries a list asks for. */
export const entryListQuery = z.strictObject({ kind: z.enum(ENTRY_KINDS) });
export type EntryListQuery = z.infer<typeof entryListQuery>;

/**
 * One row of the entry list: one language of one entry.
 *
 * A row is a translation rather than an entry, because the state, the title and
 * the date all differ between the two languages of the same piece of writing.
 */
export const entryListItem = z.object({
  /** The translation, which is what a row opens. */
  id: z.uuid(),
  /** The piece of writing it is one language of. */
  entryId: z.uuid(),
  title: z.string(),
  state: z.enum(PUBLICATION_STATES),
  language: z.enum(CONTENT_LANGUAGES),
  /**
   * When it was published, or, for one never published, when its entry was
   * created. A list sorted by this puts the newest writing first whatever its
   * state.
   */
  date: z.iso.datetime(),
  /** The address of its picture, where it has one the dashboard can show. */
  thumbnailUrl: z.string().nullable(),
  /** Whether the same entry exists in the other language as well. */
  translated: z.boolean(),
});
export type EntryListItem = z.infer<typeof entryListItem>;

/** The entry list, newest first. */
export const entryList = z.array(entryListItem);
export type EntryList = z.infer<typeof entryList>;
