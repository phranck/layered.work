import { ErrorCode, type MediaProcessing } from "@layered/schemas";
import { asc, eq } from "drizzle-orm";
import type { Database } from "../db/connect.js";
import { media, mediaJobs, mediaVariants } from "../db/schema/index.js";
import { HttpError } from "../http/response.js";

export async function getMediaProcessing(db: Database, id: string): Promise<MediaProcessing> {
  const [row] = await db
    .select({ state: mediaJobs.state, errorId: mediaJobs.errorId })
    .from(media)
    .leftJoin(mediaJobs, eq(mediaJobs.mediaId, media.id))
    .where(eq(media.id, id));
  if (!row) throw new HttpError(ErrorCode.NotFound, "That file is not in the media library.");
  const variants = await db
    .select({
      format: mediaVariants.format,
      width: mediaVariants.width,
      height: mediaVariants.height,
      byteSize: mediaVariants.byteSize,
      storageKey: mediaVariants.storageKey,
    })
    .from(mediaVariants)
    .where(eq(mediaVariants.mediaId, id))
    .orderBy(asc(mediaVariants.width), asc(mediaVariants.format));
  return { state: row.state ?? "ready", errorId: row.errorId, variants };
}
