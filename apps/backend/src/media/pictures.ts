import { ErrorCode } from "@layered/schemas";
import { and, eq, inArray } from "drizzle-orm";
import { RASTER_MIME_TYPES } from "../account/repository.js";
import type { database } from "../db/connect.js";
import { media } from "../db/schema/index.js";
import { HttpError } from "../http/response.js";

type Database = ReturnType<typeof database>;

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
 */
export async function holdLibraryPicture(
  db: Pick<Database, "select">,
  mediaId: string,
  refusal: string,
): Promise<void> {
  const [picture] = await db
    .select({ id: media.id })
    .from(media)
    .where(and(eq(media.id, mediaId), eq(media.kind, "image"), inArray(media.mimeType, RASTER_MIME_TYPES)))
    .limit(1)
    .for("key share");
  if (!picture) throw new HttpError(ErrorCode.InvalidRequest, refusal);
}
