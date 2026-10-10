import { ACCEPTED_IMAGE_TYPES, ErrorCode } from "@layered/schemas";
import { and, eq, inArray, type SQL, sql } from "drizzle-orm";
import type { Database } from "../db/connect.js";
import { media, unsplashPhotos } from "../db/schema/index.js";
import { HttpError } from "../http/response.js";

const RASTER_TYPES: ReadonlySet<string> = new Set(ACCEPTED_IMAGE_TYPES);

/**
 * Whether a library file is a picture the dashboard and the site can draw: an
 * image of a raster type the library accepts.
 *
 * Every reader that offers a thumbnail, a portrait, a cover or a social card
 * asks this, in code or as `rasterImage()` in a query, so no screen shows a file
 * another refuses.
 *
 * @param file - Its kind and its MIME type.
 */
export function isRasterImage(file: { kind: string; mimeType: string }): boolean {
  return file.kind === "image" && RASTER_TYPES.has(file.mimeType);
}

/** The same as `isRasterImage`, as a condition on the `media` table. */
export function rasterImage(): SQL {
  return sql`(${eq(media.kind, "image")} and ${inArray(media.mimeType, [...ACCEPTED_IMAGE_TYPES])})`;
}

/**
 * Refuses an id that names no raster image in the library, and holds the image
 * until the caller's transaction ends.
 *
 * A setting that names a picture is a JSON value rather than a foreign key, so
 * nothing in the schema stops the picture being deleted whilst it is saved. The
 * `key share` lock is what does: deleting a file takes its row `for update`,
 * which waits for this lock, and then finds the saved setting among the file's
 * uses. A deletion that got there first leaves no row, and this refuses.
 *
 * @param db - The transaction the setting is saved in.
 * @param mediaId - The id the setting names.
 * @param refusal - What the caller is told when the id names no such picture.
 * @param options.storedHere - Refuse a picture that lives on Unsplash, for a
 *   setting whose bytes are read here or whose address is built from a storage
 *   key, such as the watermark and the site's sharing picture.
 */
export async function holdLibraryPicture(
  db: Pick<Database, "select">,
  mediaId: string,
  refusal: string,
  options: { storedHere?: boolean } = {},
): Promise<void> {
  const [picture] = await db
    .select({ id: media.id })
    .from(media)
    .where(and(eq(media.id, mediaId), rasterImage(), options.storedHere ? storedInLibrary() : undefined))
    .limit(1)
    .for("key share");
  if (!picture) throw new HttpError(ErrorCode.InvalidRequest, refusal);
}

/**
 * Whether a library row's bytes are stored here, which is every row except a
 * picture that lives on Unsplash.
 */
export function storedInLibrary(): SQL {
  return sql`not exists (select 1 from ${unsplashPhotos} where ${unsplashPhotos.mediaId} = ${media.id})`;
}
