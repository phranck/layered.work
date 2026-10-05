import { randomUUID } from "node:crypto";
import { ErrorCode, type MediaDeletionResult } from "@layered/schemas";
import { and, asc, eq, sql } from "drizzle-orm";
import { auditActor } from "../auth/audit-actor.js";
import type { database } from "../db/connect.js";
import {
  auditLog,
  media,
  mediaAttempts,
  mediaDeletions,
  mediaJobs,
  mediaVariants,
} from "../db/schema/index.js";
import { HttpError } from "../http/response.js";
import { logger } from "../logger.js";
import { getMediaUses } from "./library.js";
import { deleteMediaObject } from "./storage.js";

type Database = ReturnType<typeof database>;

/** Cleanup has its own durable row and lock; storage deletes are idempotent after a crash. */
export async function processMediaDeletion(db: Database, id?: string): Promise<MediaDeletionResult | null> {
  let selected: string | undefined;
  try {
    return await db.transaction(async (tx) => {
      const [job] = await tx
        .select()
        .from(mediaDeletions)
        .where(
          id
            ? eq(mediaDeletions.mediaId, id)
            : and(
                sql`cardinality(${mediaDeletions.pendingKeys}) > 0`,
                sql`${mediaDeletions.nextAttemptAt} <= now()`,
              ),
        )
        .orderBy(asc(mediaDeletions.createdAt))
        .limit(1)
        .for("update", id ? undefined : { skipLocked: true });
      if (!job) return null;
      selected = job.mediaId;
      for (const key of job.pendingKeys) await deleteMediaObject(key);
      const removedObjects = job.removedObjects + job.pendingKeys.length;
      await tx
        .update(mediaDeletions)
        .set({ pendingKeys: [], removedObjects, errorId: null })
        .where(eq(mediaDeletions.mediaId, job.mediaId));
      return { deleted: true, cleanupState: "ready", removedObjects, errorId: null };
    });
  } catch (cause) {
    if (!selected) throw cause;
    const errorId = randomUUID();
    const [pending] = await db
      .update(mediaDeletions)
      .set({ errorId, nextAttemptAt: new Date(Date.now() + 60_000) })
      .where(eq(mediaDeletions.mediaId, selected))
      .returning();
    logger.error(
      {
        code: "media_object_cleanup_pending",
        errorId,
        operation: "media.delete",
        mediaId: selected,
        status: 202,
        result: "cleanup_recorded",
        cause: cause instanceof Error ? cause.name : "unknown",
      },
      "media object cleanup pending",
    );
    return { deleted: true, cleanupState: "pending", removedObjects: pending?.removedObjects ?? 0, errorId };
  }
}

export async function deleteMedia(
  db: Database,
  id: string,
  actor?: { userId: string; tokenId?: string },
): Promise<MediaDeletionResult> {
  await db.transaction(async (tx) => {
    // Image publication locks the job before the media row; deletion uses the same order.
    const [job] = await tx.select().from(mediaJobs).where(eq(mediaJobs.mediaId, id)).for("update");
    const [file] = await tx.select().from(media).where(eq(media.id, id)).for("update");
    if (!file) {
      const [pending] = await tx.select().from(mediaDeletions).where(eq(mediaDeletions.mediaId, id));
      if (pending) return;
      throw new HttpError(ErrorCode.NotFound, "That file is not in the media library.");
    }
    const uses = await getMediaUses(tx, id);
    if (uses.length)
      throw new HttpError(
        ErrorCode.Conflict,
        `This file is used by: ${uses.map((use) => use.title).join(", ")}. Remove those references first.`,
      );
    if (job?.state === "queued" || job?.state === "processing")
      throw new HttpError(
        ErrorCode.Conflict,
        "This file is still being processed. Wait for processing to finish before deleting it.",
      );
    const variants = await tx
      .select({ key: mediaVariants.storageKey })
      .from(mediaVariants)
      .where(eq(mediaVariants.mediaId, id));
    const keys = [
      ...new Set([
        file.storageKey,
        ...variants.map((variant) => variant.key),
        ...(job?.objectKeys ?? []),
        ...(
          await tx
            .select({ keys: mediaAttempts.objectKeys })
            .from(mediaAttempts)
            .where(eq(mediaAttempts.mediaId, id))
        ).flatMap((attempt) => attempt.keys),
      ]),
    ];
    await tx.insert(mediaDeletions).values({ mediaId: id, pendingKeys: keys });
    await tx.delete(media).where(eq(media.id, id));
    if (actor)
      await tx.insert(auditLog).values({
        ...auditActor(actor.userId, actor.tokenId),
        action: "media.deleted",
        subjectType: "media",
        subjectId: id,
        detail: { objects: keys.length },
      });
  });
  const result = await processMediaDeletion(db, id);
  if (!result) throw new HttpError(ErrorCode.Internal, "The file cleanup could not be confirmed.");
  return result;
}
