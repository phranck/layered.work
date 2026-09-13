import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { identifier, instant } from "./columns.js";
import { entries, topics } from "./entries.js";
import { language, navigationPlacement } from "./enums.js";

/**
 * The lists of links in the header and the footer.
 *
 * **An item points at a thing, not at an address.** Choosing an entry stores
 * that entry's identifier, and the renderer asks for its current path in the
 * language being read. Renaming the entry therefore leaves every link working
 * with no redirect hop, and the German menu reaches the German article whilst
 * the English one reaches the English article, from a single row.
 *
 * An external address is the exception and is stored as written, because
 * nothing here owns it.
 */

/**
 * One list of links.
 *
 * The header has one. The footer has as many as phranck makes, drawn in the
 * order this table gives, each under its own heading.
 */
export const navigations = pgTable(
  "navigations",
  {
    id: identifier(),
    placement: navigationPlacement().notNull(),

    /**
     * Where this list stands among the others in the same place.
     *
     * Explicit, because insertion order is not an order: it survives no
     * reordering and no restore. Queries break a tie with the identifier, which
     * is time-ordered, so two rows left at the same position come out in an
     * arbitrary order but never in a different one from one page to the next.
     */
    sortOrder: integer("sort_order").notNull().default(0),

    createdAt: instant("created_at"),
  },
  (table) => [index("navigations_by_placement").on(table.placement, table.sortOrder)],
);

/**
 * What a list is called, in one language.
 *
 * The footer draws this as the heading above the links. The header has no room
 * for one and does not draw it, which is a fact about the design rather than
 * about the row, so it is stored either way.
 *
 * Both languages are expected. That one may not be left empty whilst the other
 * is filled is a rule the API holds, because no constraint can see a row that
 * was never written.
 */
export const navigationTranslations = pgTable(
  "navigation_translations",
  {
    id: identifier(),
    navigationId: uuid("navigation_id")
      .notNull()
      .references(() => navigations.id, { onDelete: "cascade" }),
    language: language().notNull(),
    title: text().notNull(),
  },
  (table) => [unique("navigation_translations_one_per_language").on(table.navigationId, table.language)],
);

/**
 * One link, and what it points at.
 *
 * Exactly one of the three targets is meant to be set, and the check permits
 * none of them as well. That is deliberate: an item whose entry has been
 * deleted keeps its label and loses its target, so the dashboard can show it as
 * broken. Dropping it silently would lose the fact that somebody put a link
 * there.
 *
 * Nesting goes one level. The schema permits more, since a check constraint
 * cannot see a row's grandparent, and the API refuses it. A deeper menu is a
 * different design and would need one.
 */
export const navigationItems = pgTable(
  "navigation_items",
  {
    id: identifier(),
    navigationId: uuid("navigation_id")
      .notNull()
      .references(() => navigations.id, { onDelete: "cascade" }),

    /** Null for an item at the top level. */
    parentId: uuid("parent_id"),

    sortOrder: integer("sort_order").notNull().default(0),

    /** The entry this points at. Its path is resolved per language at render. */
    entryId: uuid("entry_id").references(() => entries.id, { onDelete: "set null" }),

    /** The topic this points at, resolved the same way. */
    topicId: uuid("topic_id").references(() => topics.id, { onDelete: "set null" }),

    /** Somewhere else entirely, written out in full. */
    href: text(),
  },
  (table) => [
    /**
     * Removing a group removes what was under it, which is what somebody
     * deleting a group means, and what the dashboard warns about first.
     */
    foreignKey({
      name: "navigation_items_parent_fk",
      columns: [table.parentId],
      foreignColumns: [table.id],
    }).onDelete("cascade"),

    check(
      "navigation_items_at_most_one_target",
      sql`num_nonnulls(${table.entryId}, ${table.topicId}, ${table.href}) <= 1`,
    ),
    check("navigation_items_not_its_own_parent", sql`${table.id} <> ${table.parentId}`),
    index("navigation_items_by_navigation").on(table.navigationId, table.sortOrder),
    index("navigation_items_by_parent").on(table.parentId),
  ],
);

/**
 * What a link says, in one language, and whether it is shown at all.
 *
 * `visible` is per language because a page may exist in one language only, and
 * a menu offering a reader something that is not there in their language is
 * worse than a shorter menu.
 */
export const navigationItemTranslations = pgTable(
  "navigation_item_translations",
  {
    id: identifier(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => navigationItems.id, { onDelete: "cascade" }),
    language: language().notNull(),
    label: text().notNull(),
    visible: boolean().notNull().default(true),
  },
  (table) => [unique("navigation_item_translations_one_per_language").on(table.itemId, table.language)],
);
