import { isNotNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { media, mediaJobs } from "../db/schema/index.js";

type Database = PostgresJsDatabase<Record<string, unknown>>;

/**
 * Puts pictures back in the processing queue, so their sizes are derived again
 * from the original.
 *
 * The claim and the registered keys are cleared. A job still running for one of
 * these pictures then no longer owns it, publishes nothing, and its attempt is
 * cleaned up as an abandoned one, whilst the sizes being served stay in place
 * until the next run publishes their replacements. Left in place, the keys would
 * be those of the published sizes, and the next run deletes registered keys
 * before it starts.
 *
 * @param db - The database or the transaction the change belongs to.
 * @param mediaIds - The pictures to derive again.
 */
export async function queueMediaProcessing(
  db: Pick<Database, "insert">,
  mediaIds: readonly string[],
): Promise<void> {
  if (mediaIds.length === 0) return;
  await db
    .insert(mediaJobs)
    .values(mediaIds.map((mediaId) => ({ mediaId })))
    .onConflictDoUpdate({
      target: mediaJobs.mediaId,
      set: {
        state: "queued",
        claimToken: null,
        leaseExpiresAt: null,
        errorId: null,
        objectKeys: sql`'{}'::text[]`,
      },
    });
}

/**
 * Queues every picture that carries a watermark, because the mark they carry changed.
 *
 * @param db - The transaction the changed mark is saved in.
 */
export async function queueWatermarkedMedia(db: Pick<Database, "insert" | "select">): Promise<void> {
  const marked = await db.select({ id: media.id }).from(media).where(isNotNull(media.watermark));
  await queueMediaProcessing(
    db,
    marked.map((row) => row.id),
  );
}
