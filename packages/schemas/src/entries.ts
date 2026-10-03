import { z } from "zod";
import { body, MaxLength, text } from "./request.js";
import { SLUG_PATTERN } from "./slug.js";

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

/**
 * How wide the text of a translation is set: `narrow` 56ch, `normal` 68ch,
 * `wide` 82ch, and `full` the page's own measure.
 */
export const READING_WIDTHS = ["narrow", "normal", "wide", "full"] as const;
export type ReadingWidth = (typeof READING_WIDTHS)[number];

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
  /**
   * The names of the entry's topics, in this translation's language where the
   * topic has a name in it, so a search finds a post by what it is about.
   */
  topics: z.array(z.string()),
  /** Whether it is in the bin, gone from the site until it is restored or the bin is emptied. */
  trashed: z.boolean(),
});
export type EntryListItem = z.infer<typeof entryListItem>;

/** The entry list, newest first. */
export const entryList = z.array(entryListItem);
export type EntryList = z.infer<typeof entryList>;

/** The translation an address names, as a path parameter. */
export const entryIdParam = z.strictObject({ id: z.uuid() });

/**
 * One translation of one entry, as the editor opens it.
 *
 * Everything the editor shows or changes: the text, the properties in its
 * panel, the address it answers at, and the other language of the same entry
 * where there is one.
 */
export const entryDetail = z.object({
  /** The translation. */
  id: z.uuid(),
  /** The entry it is one language of. */
  entryId: z.uuid(),
  kind: z.enum(ENTRY_KINDS),
  language: z.enum(CONTENT_LANGUAGES),
  title: z.string(),
  summary: z.string().nullable(),
  body: z.string(),
  state: z.enum(PUBLICATION_STATES),
  readingWidth: z.enum(READING_WIDTHS),
  /**
   * Whether the other language's listings show it as well whilst that language
   * has no published version of its own.
   */
  showInOtherLanguage: z.boolean(),
  /** When it first became public, or null whilst it never has been. */
  publishedAt: z.iso.datetime().nullable(),
  /** When anything about the entry last changed. */
  modifiedAt: z.iso.datetime(),
  /** The address it answers at, or null where it has none. */
  path: z.string().nullable(),
  /**
   * The last segment of that address, or the one its title would give where it
   * has no address yet, which is what the editor offers to change.
   */
  slug: z.string(),
  /** Its picture, where it has one the dashboard can show. */
  pictureUrl: z.string().nullable(),
  /**
   * The topics of the entry, named in this translation's language where they
   * can be. `named` is false where the topic has no name in that language and
   * shows the other one, so the editor can say so rather than pass it off.
   */
  topics: z.array(z.object({ id: z.uuid(), name: z.string(), named: z.boolean() })),
  /** The other language of the same entry, or null where there is none or it is in the bin. */
  counterpart: z.object({ id: z.uuid(), language: z.enum(CONTENT_LANGUAGES), title: z.string() }).nullable(),
  /** Whether the other language exists and is in the bin, so it cannot be created again. */
  counterpartTrashed: z.boolean(),
  /** Whether this translation is in the bin. */
  trashed: z.boolean(),
});
export type EntryDetail = z.infer<typeof entryDetail>;

/**
 * What moving a translation to the bin will affect, for the question asked
 * before it happens.
 */
export const entryTrashImpact = z.object({
  /** How many files it names, which are released for deletion once the bin is emptied. */
  mediaReferences: z.number().int().nonnegative(),
  /** How many navigation items point at its entry. */
  navigationItems: z.number().int().nonnegative(),
});
export type EntryTrashImpact = z.infer<typeof entryTrashImpact>;

/** What emptying the bin answers with: how many translations were deleted for good. */
export const emptiedBin = z.object({ deleted: z.number().int().nonnegative() });
export type EmptiedBin = z.infer<typeof emptiedBin>;

/** How many topics one entry may carry. A list longer than this describes nothing. */
export const MAX_TOPICS_PER_ENTRY = 20;

/**
 * What saving a translation sends.
 *
 * The whole of what the editor changes, every time, so a save is one statement
 * of the translation rather than a patch that depends on what came before. The
 * entry's kind and its language are not here: neither is changed by writing.
 * Of the address only the last segment is, because the language prefix and any
 * section before it follow from what the entry is.
 *
 * The topics belong to the entry rather than to this translation, so saving
 * either language sets them for both, which is what the panel shows.
 */
export const saveEntryBody = body({
  title: text(MaxLength.Line),
  summary: z.string().trim().max(MaxLength.Paragraph).nullable(),
  body: z.string().max(MaxLength.Body),
  state: z.enum(PUBLICATION_STATES),
  readingWidth: z.enum(READING_WIDTHS),
  showInOtherLanguage: z.boolean(),
  topicIds: z.array(z.uuid()).max(MAX_TOPICS_PER_ENTRY),
  /**
   * The last segment of the address. A changed one becomes the current address
   * and the old one keeps answering as a redirect.
   */
  slug: text(MaxLength.Handle, { pattern: SLUG_PATTERN }),
});
export type SaveEntryBody = z.infer<typeof saveEntryBody>;

/**
 * What asking for a preview sends: what the editor holds, saved or not.
 *
 * The state is not here, because a preview shows the entry as a reader would
 * see it whatever its state, and the address is not here, because a preview
 * has its own.
 */
export const previewEntryBody = body({
  title: text(MaxLength.Line),
  summary: z.string().trim().max(MaxLength.Paragraph).nullable(),
  body: z.string().max(MaxLength.Body),
  readingWidth: z.enum(READING_WIDTHS),
});
export type PreviewEntryBody = z.infer<typeof previewEntryBody>;

/** Where a preview can be opened, and until when. */
export const entryPreview = z.object({ url: z.url(), expiresAt: z.iso.datetime() });
export type EntryPreview = z.infer<typeof entryPreview>;

/**
 * A preview token as a path parameter: a signed payload, base64url on both sides
 * of one dot, and bounded, because it reaches a decoder.
 */
export const previewTokenParam = z.strictObject({
  token: z
    .string()
    .max(512)
    .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/),
});
