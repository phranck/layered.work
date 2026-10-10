import { randomUUID } from "node:crypto";
import { ErrorCode, slugFromTitle, type UnsplashSearchPage, type UploadedMedia } from "@layered/schemas";
import { eq } from "drizzle-orm";
import { mediaContentUrl } from "../account/repository.js";
import { auditActor } from "../auth/audit-actor.js";
import type { Database } from "../db/connect.js";
import { auditLog, media, unsplashPhotos } from "../db/schema/index.js";
import { HttpError } from "../http/response.js";
import { logger } from "../logger.js";
import { insertUnderFreeSlug } from "../media/upload.js";
import { readUnsplashPhoto, searchUnsplash, trackUnsplashDownload } from "./client.js";

/**
 * Unsplash photos as library pictures.
 *
 * A chosen photo becomes a library row like an upload, so content names it by
 * slug, but no bytes are stored: Unsplash requires the photo to be hotlinked.
 * The row's storage key and checksum are both derived from the photo id, which
 * makes them unique without naming any object, and makes the same photo chosen
 * twice the same picture.
 */

/** The storage key of a picture that lives on Unsplash. It names no object in any bucket. */
export function unsplashStorageKey(photoId: string): string {
  return `unsplash/${photoId}`;
}

/** The checksum column's value for a picture that lives on Unsplash, unique per photo. */
function unsplashChecksum(photoId: string): string {
  return `unsplash:${photoId}`;
}

/** The type Unsplash stores its originals as, which the library records. */
const UNSPLASH_TYPE = "image/jpeg";

/**
 * One page of Unsplash search results, as the media browser shows them.
 *
 * @param query - What to search for.
 * @param page - Which page, from 1.
 */
export async function searchUnsplashPhotos(query: string, page: number): Promise<UnsplashSearchPage> {
  const { photos, hasMore } = await searchUnsplash(query, page);
  return {
    page,
    hasMore,
    items: photos.map((photo) => ({
      id: photo.id,
      thumbnailUrl: photo.urls.small,
      width: photo.width,
      height: photo.height,
      description: photo.alt_description ?? photo.description ?? null,
      photographer: photo.user.name,
    })),
  };
}

/**
 * Takes one Unsplash photo into the library, and tells Unsplash it was used.
 *
 * The photo is read from Unsplash by its id, so nothing the browser sends
 * decides an address, a name or a size. A photo already in the library is
 * answered with its existing picture, and choosing it again still counts as a
 * use. A failed report to Unsplash is logged and does not undo the choice,
 * because the picture is in the library either way.
 *
 * @param db - The database.
 * @param photoId - Unsplash's id for the photo.
 * @param actor - Who chose it, for the audit log.
 */
export async function importUnsplashPhoto(
  db: Database,
  photoId: string,
  actor: { userId: string; tokenId?: string },
): Promise<UploadedMedia> {
  const photo = await readUnsplashPhoto(photoId);
  const [existing] = await db
    .select({ id: media.id, slug: media.slug })
    .from(media)
    .where(eq(media.checksum, unsplashChecksum(photo.id)))
    .limit(1);

  const row =
    existing ??
    (await insertUnderFreeSlug(
      db,
      slugFromTitle(photo.alt_description || `unsplash ${photo.id}`, "unsplash"),
      async (tx, slug) => {
        const [created] = await tx
          .insert(media)
          .values({
            slug,
            kind: "image",
            mimeType: UNSPLASH_TYPE,
            storageKey: unsplashStorageKey(photo.id),
            byteSize: 0,
            checksum: unsplashChecksum(photo.id),
            width: photo.width,
            height: photo.height,
          })
          .onConflictDoNothing({ target: media.slug })
          .returning({ id: media.id, slug: media.slug });
        if (created) {
          await tx.insert(unsplashPhotos).values({
            mediaId: created.id,
            photoId: photo.id,
            imageUrl: photo.urls.raw,
            photographerName: photo.user.name,
            photographerUrl: photo.user.links.html,
          });
          await tx.insert(auditLog).values({
            ...auditActor(actor.userId, actor.tokenId),
            action: "media.unsplash_imported",
            subjectType: "media",
            subjectId: created.id,
          });
        }
        return created;
      },
    ));
  if (!row) throw new HttpError(ErrorCode.Conflict, "No free name could be found for this photo.");

  try {
    await trackUnsplashDownload(photo.links.download_location);
  } catch (cause) {
    logger.warn(
      {
        code: "unsplash_download_untracked",
        errorId: randomUUID(),
        operation: "media.unsplash_import",
        result: "picture_kept",
        mediaId: row.id,
        cause: cause instanceof HttpError ? cause.message : cause instanceof Error ? cause.name : "unknown",
      },
      "unsplash download not tracked",
    );
  }
  return {
    id: row.id,
    slug: row.slug,
    url: mediaContentUrl(row.id),
    width: photo.width,
    height: photo.height,
    existing: Boolean(existing),
  };
}
