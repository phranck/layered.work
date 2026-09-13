import { sql } from "drizzle-orm";
import { bigint, check, index, integer, pgTable, real, text, unique, uuid } from "drizzle-orm/pg-core";
import { identifier, instant } from "./columns.js";
import { imageFormat, language, mediaKind } from "./enums.js";

/**
 * Every file the site serves, and the sizes derived from it.
 *
 * **Content names a file, never a path.** A body writes `Image("soundbox-front")`
 * and the renderer turns that into whatever address the file has today. That one
 * indirection is what lets the bucket be reorganised, the variants regenerated,
 * or the whole store replaced without a single entry being edited, which is the
 * thing the old site could not do: there the path was written into the body, so
 * moving a file meant finding every article that mentioned it.
 *
 * The tables below are therefore split by what changes and what does not. The
 * slug and the identity of the file never change. The storage key, the
 * dimensions of the derived sizes and the formats all do.
 */

/**
 * A file, addressed by a name that outlives every arrangement of the storage.
 *
 * One row per distinct file rather than per upload. The checksum is unique, so
 * uploading the same picture a second time finds the first row instead of
 * paying for the bytes twice, which matters because the same screenshot tends
 * to be dragged in from two places.
 */
export const media = pgTable(
  "media",
  {
    id: identifier(),

    /**
     * What content refers to, and the one value here that is promised never to
     * change. Lower case, hyphenated, unique across every kind of file.
     */
    slug: text().notNull().unique(),

    kind: mediaKind().notNull(),

    /** The exact type, for the `Content-Type` the bucket serves it with. */
    mimeType: text("mime_type").notNull(),

    /**
     * Where the original sits in the bucket.
     *
     * Free to change, because nothing outside this row knows it. Renaming an
     * object in the bucket is an update here and touches no entry, which is
     * what the slug above is for.
     */
    storageKey: text("storage_key").notNull().unique(),

    /** `bigint` so that the number is never the reason an upload is refused. */
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),

    /**
     * SHA-256 of the bytes, hex. Unique, so the same file cannot be stored
     * twice, and it is also what a migration checks an upload against.
     */
    checksum: text().notNull().unique(),

    /**
     * The dimensions of the original. Null for a document, which has none.
     *
     * An image always has them, which the check below makes true of the table
     * rather than of the code that writes to it. A page that reserves space for
     * a picture needs both numbers before the picture arrives, and without them
     * it reserves nothing and jumps when it loads.
     */
    width: integer(),
    height: integer(),

    /**
     * Which part of the picture matters, as two fractions of its width and
     * height. The centre is the default because it is right more often than
     * anything else, and a crop that respects it is the same crop everywhere:
     * every surface reads these two numbers and applies them as
     * `object-position`, so nothing does the arithmetic at the call site.
     */
    focalX: real("focal_x").notNull().default(0.5),
    focalY: real("focal_y").notNull().default(0.5),

    /**
     * A very small blurred version, inline.
     *
     * It sits on the row rather than in the bucket so that showing something
     * whilst the real image loads costs no second request, which would make the
     * placeholder arrive at about the same time as the thing it stands in for.
     */
    placeholder: text(),

    uploadedAt: instant("uploaded_at"),
  },
  (table) => [
    check(
      "media_image_has_dimensions",
      sql`${table.kind} <> 'image' or (${table.width} is not null and ${table.height} is not null)`,
    ),
    check(
      "media_focal_point_within_bounds",
      sql`${table.focalX} between 0 and 1 and ${table.focalY} between 0 and 1`,
    ),
    index("media_by_kind").on(table.kind),
  ],
);

/**
 * One derived size and format of an image.
 *
 * Every variant is disposable: delete the lot and a job makes them again from
 * the original, which is why this table cascades from the media row and why
 * nothing outside the renderer ever names a variant.
 */
export const mediaVariants = pgTable(
  "media_variants",
  {
    id: identifier(),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),

    format: imageFormat().notNull(),
    width: integer().notNull(),
    height: integer().notNull(),
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    storageKey: text("storage_key").notNull().unique(),

    createdAt: instant("created_at"),
  },
  (table) => [
    /**
     * One variant per format per width. The height follows from the width and
     * the original's ratio, so it is not part of what makes a variant distinct.
     */
    unique("media_variants_one_per_format_and_width").on(table.mediaId, table.format, table.width),
    index("media_variants_by_media").on(table.mediaId),
  ],
);

/**
 * What a file is called in words, in one language.
 *
 * Alt text is prose a reader hears, so it belongs to a language exactly as a
 * title does. A German page reading English alt text is the defect this table
 * exists to prevent.
 *
 * **An absent row and an empty alt text are different things.** No row, or a
 * null, means nobody has written one yet, and the library lists those so they
 * can be written. An empty string means the picture is decorative and a screen
 * reader should pass over it in silence, which is a decision somebody made
 * rather than one nobody got round to.
 */
export const mediaTranslations = pgTable(
  "media_translations",
  {
    id: identifier(),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    language: language().notNull(),

    altText: text("alt_text"),

    /** Shown beneath the picture, where a picture is given one. */
    caption: text(),
  },
  (table) => [
    unique("media_translations_one_per_language").on(table.mediaId, table.language),

    /** A row that says nothing in either column is a row nothing meant to write. */
    check("media_translations_says_something", sql`num_nonnulls(${table.altText}, ${table.caption}) > 0`),
  ],
);
