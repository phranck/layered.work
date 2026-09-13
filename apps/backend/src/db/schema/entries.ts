import { sql } from "drizzle-orm";
import {
  boolean,
  check,
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

    /** When it first became public. Null whilst it never has been. */
    publishedAt: timestamp("published_at", { withTimezone: true }),

    /** The hash of the password a protected entry asks for. Never the password. */
    passwordHash: text("password_hash"),

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
  },
  (table) => [
    unique("entry_translations_one_per_language").on(table.entryId, table.language),

    /**
     * A protected translation has a password, and one that is not protected has
     * none. Without this, choosing the state and setting the password are two
     * steps, and an entry that is protected with nothing to ask for shows its
     * body to anyone.
     */
    check(
      "entry_translations_protected_has_password",
      sql`(${table.state} = 'protected') = (${table.passwordHash} is not null)`,
    ),

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
