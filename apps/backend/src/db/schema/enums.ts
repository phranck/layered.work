import { pgEnum } from "drizzle-orm/pg-core";

/**
 * The closed sets the schema uses, as types in the database rather than as
 * strings with a convention around them.
 *
 * A loose string means every reader has to know the permitted values and every
 * writer has to remember them, and the one that forgets writes a row nothing
 * rejects. These are declared once here because later tables read them too: a
 * navigation item and a topic are written in a language just as an entry is.
 */

/** What an entry is. A post appears in listings by date; a page stands alone. */
export const entryKind = pgEnum("entry_kind", ["post", "page"]);

/**
 * How far a translation has got, and who may read it.
 *
 * `public` appears everywhere. `draft` exists only in the dashboard. `hidden`
 * answers at its own address and appears in no listing, feed, sitemap or search
 * result. `protected` asks for a password before it shows its body.
 *
 * Per translation rather than per entry, because an English post can be public
 * whilst its German version is still being written.
 */
export const publicationState = pgEnum("publication_state", ["public", "draft", "hidden", "protected"]);

/**
 * The two languages the site is written in.
 *
 * A type rather than a free string, so a third language is a migration that
 * every query is checked against rather than a value that quietly appears.
 */
export const language = pgEnum("language", ["en", "de"]);

/**
 * How wide the text of an entry is set.
 *
 * The four the design settled on, measured in characters per line: `narrow` is
 * 56ch, `normal` 68ch, `wide` 82ch, and `full` fills the measure of the page.
 * Chosen per translation, because a German text of the same article is longer
 * and may want a different one.
 */
export const readingWidth = pgEnum("reading_width", ["narrow", "normal", "wide", "full"]);
