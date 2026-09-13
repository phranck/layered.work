import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { identifier, instant } from "./columns.js";
import { homeBlockType } from "./enums.js";

/**
 * The site as a whole: the accounts in its footer, the blocks its home page is
 * assembled from, and the handful of values that belong to none of them.
 *
 * **What a value may be is declared in code, and validated there.** A block's
 * settings and a setting's value are both `jsonb`, because the shape differs
 * per block type and per key and a column per shape would mean a migration for
 * every new one. Postgres cannot check a document against a schema that is
 * chosen by a neighbouring column, so the declaration is the only place that
 * knows, and the API refuses anything that does not match it before it is
 * written. Whatever is in these columns got past that check.
 */

/**
 * An account shown as a mark in the footer.
 *
 * `platform` is the Simple Icons slug, such as `mastodon` or `github`, and it
 * is the only thing stored about which service this is. The set ships a title
 * and a brand colour beside every mark, so the name and the colour both follow
 * from the slug. A column holding either would be a copy of something the icon
 * set already knows, and a copy can disagree.
 */
export const socialAccounts = pgTable(
  "social_accounts",
  {
    id: identifier(),

    /** A Simple Icons slug. The API refuses one the shipped set does not have. */
    platform: text().notNull(),

    /** What to show beside the mark, in the form that service uses. */
    handle: text().notNull(),

    /** Where the mark leads. */
    href: text().notNull().unique(),

    /** Off hides it from the site at once and keeps the row. */
    enabled: boolean().notNull().default(true),

    sortOrder: integer("sort_order").notNull().default(0),

    createdAt: instant("created_at"),
  },
  (table) => [index("social_accounts_in_order").on(table.sortOrder)],
);

/**
 * One block of the home page.
 *
 * The page is not written, it is assembled, so the order of these rows is the
 * order of the page. Disabling a block takes it off the page without losing how
 * it was set up, which is what makes trying an arrangement cheap.
 */
export const homeBlocks = pgTable(
  "home_blocks",
  {
    id: identifier(),
    type: homeBlockType().notNull(),

    sortOrder: integer("sort_order").notNull().default(0),
    enabled: boolean().notNull().default(true),

    /** Whatever this type declares it can be set to. An empty object is a block on its defaults. */
    settings: jsonb().notNull().default(sql`'{}'::jsonb`),

    createdAt: instant("created_at"),
  },
  (table) => [index("home_blocks_in_order").on(table.sortOrder)],
);

/**
 * What belongs to the site rather than to anything in it.
 *
 * The key is the identity, so there is no second one. A value that differs by
 * language holds both inside itself, as `{ "en": …, "de": … }`, which the
 * declaration for that key says and the API checks.
 *
 * There is no column saying when this last changed. `audit_log` already records
 * who changed which setting and when, and a timestamp here would be a second
 * answer to that question, kept by something less careful.
 */
export const settings = pgTable("settings", {
  key: text().primaryKey(),
  value: jsonb().notNull(),
});
