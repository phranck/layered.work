import {
  CONTENT_LANGUAGES,
  ENTRY_KINDS,
  homeBlockTypes,
  IMAGE_FORMATS,
  MEDIA_KINDS,
  NAVIGATION_PLACEMENTS,
  PUBLICATION_STATES,
  READING_WIDTHS,
  TOKEN_SCOPES,
  USER_ROLES,
  WATERMARK_ANCHORS,
} from "@layered/schemas";
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

/**
 * What an entry is.
 *
 * A post appears in listings by date. A page stands alone. A project is neither:
 * it is a piece of work with its own listing at `/projects/`, which is why it is
 * a kind rather than a page carrying a label. The site already sorts all three
 * apart, and the migration read the old site the same way.
 */
export const entryKind = pgEnum("entry_kind", ENTRY_KINDS);

/**
 * How far a translation has got, and who may read it.
 *
 * `public` appears everywhere. `draft` exists only in the dashboard. `hidden`
 * answers at its own address and appears in no listing, feed, sitemap or search
 * result.
 *
 * Three states, and nothing between them: an entry is either readable by
 * whoever holds its address or it is not published.
 *
 * Per translation rather than per entry, because an English post can be public
 * whilst its German version is still being written.
 */
export const publicationState = pgEnum("publication_state", PUBLICATION_STATES);

/**
 * The two languages the site is written in.
 *
 * A type rather than a free string, so a third language is a migration that
 * every query is checked against rather than a value that quietly appears.
 */
export const language = pgEnum("language", CONTENT_LANGUAGES);

/**
 * How wide the text of an entry is set.
 *
 * The four the design settled on, measured in characters per line: `narrow` is
 * 56ch, `normal` 68ch, `wide` 82ch, and `full` fills the measure of the page.
 * Chosen per translation, because a German text of the same article is longer
 * and may want a different one.
 */
export const readingWidth = pgEnum("reading_width", READING_WIDTHS);

/**
 * What an account may do.
 *
 * Two values, which is the fewest that makes the column mean anything. There is
 * one account today and it is the `owner`, the one the seed creates. `editor`
 * exists so that adding a second person is a row rather than a migration.
 */
export const userRole = pgEnum("user_role", USER_ROLES);

/**
 * What an access token may do.
 *
 * Few and explicit, and publishing is deliberately not part of writing: a token
 * given to an agent can draft all day without being able to put anything in
 * front of a reader. A token carries the scopes it was issued with and nothing
 * widens them afterwards.
 */
export const tokenScope = pgEnum("token_scope", TOKEN_SCOPES);

/**
 * What kind of file a media row holds.
 *
 * Coarse on purpose. It decides which component renders the thing and which
 * processing it goes through, and both of those answers are the same for every
 * JPEG and every PNG. The exact type is in the mime type beside it.
 */
export const mediaKind = pgEnum("media_kind", MEDIA_KINDS);

/**
 * The formats an image is derived into.
 *
 * `avif` and `webp` are what a modern browser is offered. `jpeg` and `png` are
 * what it falls back to, and which of the two depends on whether the original
 * has transparency, so both have to exist here.
 */
export const imageFormat = pgEnum("image_format", IMAGE_FORMATS);

/**
 * Where a picture's watermark sits: a corner, the middle of an edge, or the
 * centre. The column holding it is nullable, and null is a picture without one.
 */
export const watermarkAnchor = pgEnum("watermark_anchor", WATERMARK_ANCHORS);

/**
 * Where a navigation appears.
 *
 * The header holds one. The footer holds several, stacked, each with its own
 * heading, which is the arrangement phranck asked for and the reason a
 * navigation is a row rather than a setting.
 */
export const navigationPlacement = pgEnum("navigation_placement", NAVIGATION_PLACEMENTS);

/**
 * The kinds of block the home page is assembled from.
 *
 * Every value needs a component to render it and a declaration saying what it
 * can be set to, so adding one is a code change whatever this column is. An
 * enum therefore costs nothing and keeps a block that nothing can render out of
 * the table.
 */
export const homeBlockType = pgEnum("home_block_type", homeBlockTypes);
