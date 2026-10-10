import { z } from "zod";
import { body, MaxLength, signedToken, text } from "./request.js";
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

/**
 * The states a reader may reach.
 *
 * `public` appears everywhere, and `hidden` answers at its own address whilst
 * staying out of every listing. `draft` is neither, so every query that reads
 * what the site may show filters by this list rather than by a condition of its
 * own.
 */
export const READABLE_STATES = ["public", "hidden"] as const satisfies readonly PublicationState[];
export type ReadableState = (typeof READABLE_STATES)[number];

/**
 * Whether a reader may reach a translation in this state.
 *
 * @param state - A publication state, or a wider label such as the snapshot's `trashed`.
 */
export function isReadable(state: string): state is ReadableState {
  return (READABLE_STATES as readonly string[]).includes(state);
}

/** The languages the site is written in. */
export const CONTENT_LANGUAGES = ["en", "de"] as const;
export type ContentLanguage = (typeof CONTENT_LANGUAGES)[number];

/**
 * The locale each language formats dates, numbers and lists in: British English
 * and Austrian German. Declared once, so a date written for a reader of one
 * language follows the same conventions in the mail as in the dashboard.
 */
export const CONTENT_LOCALES: Record<ContentLanguage, string> = { en: "en-GB", de: "de-AT" };

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
  /** Whether it is in the trash, gone from the site until it is restored or the trash is emptied. */
  trashed: z.boolean(),
});
export type EntryListItem = z.infer<typeof entryListItem>;

/** The entry list, newest first. */
export const entryList = z.array(entryListItem);
export type EntryList = z.infer<typeof entryList>;

/**
 * How many specification pairs one translation may carry. The project page
 * lays them out in one band, and a ninth pair is a paragraph rather than a
 * specification.
 */
export const MAX_ENTRY_SPECS = 8;

/** How long a pair's label and its value may be, so each pair stays one line of the band. */
export const ENTRY_SPEC_LENGTH = { label: 40, value: 80 } as const;

/**
 * One pair of a project's specification: what is stated, such as "Electronics",
 * and what it says.
 *
 * Free pairs rather than fixed fields, decided by phranck on 21 September 2026,
 * because a board project names its manufacturing and its electronics and a
 * woodworking one its timber and its finish. Neither half may be empty.
 */
export const entrySpec = body({
  label: text(ENTRY_SPEC_LENGTH.label),
  value: text(ENTRY_SPEC_LENGTH.value),
});
export type EntrySpec = z.infer<typeof entrySpec>;

/** A translation's specification, in the order the band shows it. */
export const entrySpecs = z.array(entrySpec).max(MAX_ENTRY_SPECS);

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
  /** The other language of the same entry, or null where there is none or it is in the trash. */
  counterpart: z.object({ id: z.uuid(), language: z.enum(CONTENT_LANGUAGES), title: z.string() }).nullable(),
  /** Whether the other language exists and is in the trash, so it cannot be created again. */
  counterpartTrashed: z.boolean(),
  /** Whether this translation is in the trash. */
  trashed: z.boolean(),
  /** The specification pairs, which a project page shows under its hero. */
  specs: entrySpecs,
});
export type EntryDetail = z.infer<typeof entryDetail>;

/** A new entry starts with one draft in the site's default language. */
export const createEntryBody = body({
  kind: z.enum(ENTRY_KINDS),
  title: text(MaxLength.Line),
});
export type CreateEntryBody = z.infer<typeof createEntryBody>;

/**
 * What moving a translation to the trash will affect, for the question asked
 * before it happens.
 */
export const entryTrashImpact = z.object({
  /** How many files it names, which are released for deletion once the trash is emptied. */
  mediaReferences: z.number().int().nonnegative(),
  /** How many navigation items point at its entry. */
  navigationItems: z.number().int().nonnegative(),
});
export type EntryTrashImpact = z.infer<typeof entryTrashImpact>;

/** What emptying the trash answers with: how many translations were deleted for good. */
export const emptiedTrash = z.object({ deleted: z.number().int().nonnegative() });
export type EmptiedTrash = z.infer<typeof emptiedTrash>;

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
  specs: entrySpecs,
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

/** A preview token as a path parameter. */
export const previewTokenParam = z.strictObject({ token: signedToken(512) });

/**
 * A value written in each language of the site, such as a title in English and
 * in German.
 *
 * Built from `CONTENT_LANGUAGES`, so every bilingual field takes a third
 * language the day the list does. Strict, as every request body is.
 *
 * @param value - What each language holds.
 */
export function inBothLanguages<Schema extends z.ZodType>(value: Schema) {
  return z.strictObject(inEachLanguage(() => value));
}

/**
 * One value for each language of the site, worked out per language.
 *
 * @param valueFor - What one language holds.
 */
export function inEachLanguage<Value>(
  valueFor: (language: ContentLanguage) => Value,
): Record<ContentLanguage, Value> {
  return Object.fromEntries(CONTENT_LANGUAGES.map((language) => [language, valueFor(language)])) as Record<
    ContentLanguage,
    Value
  >;
}

/**
 * Where each language's pages begin on the site: English at the root, German
 * below `/de/`. Every address the site, the API and the import build for a
 * language starts here.
 */
export const LANGUAGE_ROOTS: Record<ContentLanguage, string> = { en: "/", de: "/de/" };

/**
 * An address below a language's root, with a slash after every segment as the
 * site writes its addresses, such as `/de/topics/werkzeug/`.
 *
 * @param language - Whose root it starts from.
 * @param segments - The segments below that root, each without slashes.
 */
export function languagePath(language: ContentLanguage, ...segments: readonly string[]): string {
  return `${LANGUAGE_ROOTS[language]}${segments.map((segment) => `${segment}/`).join("")}`;
}

/**
 * The site's other language, which a translation is made into and a page's
 * language switch leads to.
 *
 * @param language - The language at hand.
 */
export function otherLanguage(language: ContentLanguage): ContentLanguage {
  return language === "en" ? "de" : "en";
}
