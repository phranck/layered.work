import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { identifier, instant } from "./columns.js";
import { entryKind, language, publicationState, readingWidth } from "./enums.js";
import { media } from "./media.js";
import { users } from "./people.js";

/**
 * Everything an author writes, and the addresses it answers at.
 *
 * The shape follows from one thing the old site could not do. There, a German
 * article was a second hidden post with its own slug, and the two knew about
 * each other only through a link somebody typed into the body. Here an entry is
 * the work itself and a translation is one language of it, so the pair is a row
 * rather than a habit.
 */

/**
 * A piece of work, in whichever languages it exists.
 *
 * It carries only what is true of the work rather than of one language of it:
 * what kind of thing it is, when it was made, whether it is singled out. The
 * title, the body and the state belong to a translation, because they differ
 * between them.
 */
export const entries = pgTable("entries", {
  id: identifier(),
  kind: entryKind().notNull(),

  /** Singled out at the top of the home page. */
  featured: boolean().notNull().default(false),

  /**
   * Whether it appears on the home page at all.
   *
   * Separate from the publication state, because the old site had entries that
   * were public and deliberately kept off the front, and that distinction is
   * worth keeping rather than collapsing into `hidden`.
   */
  onHomePage: boolean("on_home_page").notNull().default(true),

  createdAt: instant("created_at"),
  modifiedAt: instant("modified_at"),
});

/**
 * One language of one entry.
 *
 * Everything a reader sees is here. An entry has one or two of these, and the
 * unique constraint is what makes that true of the schema rather than of the
 * code that writes to it.
 */
export const entryTranslations = pgTable(
  "entry_translations",
  {
    id: identifier(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    language: language().notNull(),

    title: text().notNull(),
    summary: text(),

    /** The body, in the content language. Empty until something is written. */
    body: text().notNull().default(""),

    state: publicationState().notNull().default("draft"),
    readingWidth: readingWidth("reading_width").notNull().default("normal"),

    /**
     * Whether the other language's listings, feeds and search show this
     * translation as well, marked with its language, whilst that language has
     * no published version of its own. A German reader still finds an English
     * post that was never translated.
     */
    showInOtherLanguage: boolean("show_in_other_language").notNull().default(false),

    /** When it first became public. Null whilst it never has been. */
    publishedAt: timestamp("published_at", { withTimezone: true }),

    /**
     * The picture that stands for this translation: on its card, at the top of
     * the page, and on a social card.
     *
     * Per translation rather than per entry, for the same reason the reading
     * width is. A screenshot showing an interface in German belongs to the
     * German article, and the migration writes the same file to both where
     * Publii had one.
     */
    featuredMediaId: uuid("featured_media_id").references(() => media.id, { onDelete: "restrict" }),

    /**
     * When it was moved to the trash, or null whilst it is not there.
     *
     * A column rather than a fourth publication state, because the state is
     * what it returns to when it is restored. In the trash it is gone from the
     * site exactly as a draft is, and its addresses answer 410. Its rows, its
     * addresses and its media references stay until the trash is emptied, which
     * is what makes restoring it possible.
     */
    trashedAt: timestamp("trashed_at", { withTimezone: true }),
  },
  (table) => [
    unique("entry_translations_one_per_language").on(table.entryId, table.language),

    index("entry_translations_by_state").on(table.state, table.language),
  ],
);

/**
 * Every address a translation has ever answered at.
 *
 * A path is a row rather than a column so that renaming an entry adds a row and
 * marks the old one as no longer current, which turns a rename into a permanent
 * redirect instead of a broken link. Nothing is deleted here.
 *
 * **The rule for which path an entry gets.** An English entry that existed
 * before the migration keeps the bare path it answers at today, because every
 * address the old site has must go on working. Everything written afterwards
 * carries its language: `/en/…` or `/de/…`. The migration is what marks the
 * first kind, and it is the only thing that ever does.
 */
export const paths = pgTable(
  "paths",
  {
    id: identifier(),
    translationId: uuid("translation_id")
      .notNull()
      .references(() => entryTranslations.id, { onDelete: "cascade" }),

    /** The path as it appears after the host, leading slash included. */
    path: text().notNull(),

    isCurrent: boolean("is_current").notNull().default(true),

    createdAt: instant("created_at"),
  },
  (table) => [
    /** One address belongs to one translation, current or not. */
    unique("paths_unique").on(table.path),

    /**
     * Exactly one current path per translation. A partial index rather than a
     * constraint, because the rule applies to the current rows alone and every
     * former path is meant to pile up beside them.
     */
    uniqueIndex("paths_one_current_per_translation").on(table.translationId).where(sql`${table.isCurrent}`),
  ],
);

/**
 * Every address of a translation that was deleted for good, so it answers 410
 * rather than 404.
 *
 * Emptying the trash removes a translation and, through the cascade, its rows in
 * `paths`. What the site needs afterwards is only the fact that the address
 * was here and is gone, which is what a search engine needs to drop it cleanly,
 * so the addresses move here first. An address given to something new later
 * is that thing's again, and the site answers with it rather than with 410.
 */
export const gonePaths = pgTable("gone_paths", {
  /** The path as it appears after the host, leading slash included. */
  path: text().primaryKey(),
  goneAt: instant("gone_at"),
});

/**
 * A subject an entry is about.
 *
 * The topic itself carries nothing a reader sees, because everything a reader
 * sees differs by language, including the word in the address.
 */
export const topics = pgTable("topics", {
  id: identifier(),
  createdAt: instant("created_at"),
});

/**
 * What a topic is called, and what its address is, in one language.
 *
 * The same shape as a translation of an entry, and for the same reason: a topic
 * listed as `Hardware` in English and `Hardware` in German still needs two
 * addresses, and a topic whose two names differ needs two of everything.
 */
export const topicTranslations = pgTable(
  "topic_translations",
  {
    id: identifier(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    language: language().notNull(),
    name: text().notNull(),

    /** The last segment of the topic's address in this language. */
    slug: text().notNull(),
  },
  (table) => [
    unique("topic_translations_one_per_language").on(table.topicId, table.language),
    unique("topic_translations_slug_per_language").on(table.language, table.slug),
  ],
);

/**
 * Every address a topic has stopped answering at, and the topic it went to.
 *
 * A slug changed on the topics screen, or a topic merged into another, leaves
 * its old address behind as a row here, so a link to it becomes a permanent
 * redirect rather than a missing page. A slug is free again in its language
 * only once no topic and no row here holds it, which is why the two are checked
 * together wherever a slug is chosen.
 */
export const formerTopicSlugs = pgTable(
  "former_topic_slugs",
  {
    id: identifier(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    language: language().notNull(),
    slug: text().notNull(),
    createdAt: instant("created_at"),
  },
  (table) => [unique("former_topic_slugs_slug_per_language").on(table.language, table.slug)],
);

/**
 * Which files a translation's body names.
 *
 * Rebuilt from the body every time it is saved, so it always describes what is
 * written now rather than what was written at some point. It is here rather
 * than beside the media tables because it is a fact about a translation, and
 * because it is the save of a translation that produces it.
 *
 * It answers two questions that nothing else can. The database refuses to
 * delete a file an entry names, because the reference is a foreign key rather
 * than a convention, and the dashboard turns that refusal into the list of
 * entries to edit first. A file no row points at is one that nothing uses,
 * which is what makes clearing out the library possible at all.
 *
 * The same file named twice in one body is one row. The question being asked is
 * whether it is used, and twice is not more used than once.
 */
export const mediaReferences = pgTable(
  "media_references",
  {
    translationId: uuid("translation_id")
      .notNull()
      .references(() => entryTranslations.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "restrict" }),
  },
  (table) => [
    primaryKey({ columns: [table.translationId, table.mediaId] }),

    /** Asked from the media side by the library, which lists what uses a file. */
    index("media_references_by_media").on(table.mediaId),
  ],
);

/** Which entries are about which topics. */
export const entryTopics = pgTable(
  "entry_topics",
  {
    entryId: uuid("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.entryId, table.topicId] }),
    index("entry_topics_by_topic").on(table.topicId),
  ],
);

/**
 * What the editor held when somebody asked to see it as a reader would.
 *
 * A preview shows the text being written, unsaved changes included, because
 * saving first would put a public entry's half-finished change live. So the
 * editor's state is kept here for as long as the preview link lasts, and
 * nowhere is it mistaken for the translation itself: the site's snapshot never
 * reads this table.
 *
 * Rows past their expiry are removed whenever a new preview is made, so the
 * table holds the previews of the last hour and nothing older.
 */
export const entryPreviews = pgTable(
  "entry_previews",
  {
    id: identifier(),
    translationId: uuid("translation_id")
      .notNull()
      .references(() => entryTranslations.id, { onDelete: "cascade" }),
    title: text().notNull(),
    summary: text(),
    body: text().notNull(),
    readingWidth: readingWidth("reading_width").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: instant("created_at"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("entry_previews_by_expiry").on(table.expiresAt)],
);
