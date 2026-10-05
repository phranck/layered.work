import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { mediaAttempts, mediaJobs } from "../db/schema/index.js";
import { logger } from "../logger.js";
import { deleteMediaObject } from "./storage.js";

type Database = PostgresJsDatabase<Record<string, unknown>>;

/** A lost, unacknowledged generation retains its tombstone because its upload may finish late. */
export async function processMediaAttemptCleanup(
  db: Database,
  mediaId?: string,
  token?: string,
): Promise<void> {
  let selected: string | undefined;
  try {
    await db.transaction(async (tx) => {
      const [attempt] = await tx
        .select()
        .from(mediaAttempts)
        .where(
          and(
            mediaId ? eq(mediaAttempts.mediaId, mediaId) : undefined,
            token ? eq(mediaAttempts.token, token) : undefined,
            mediaId || token ? undefined : sql`${mediaAttempts.nextAttemptAt} <= now()`,
            sql`${mediaAttempts.cleanupReady} or not exists (select 1 from ${mediaJobs} where ${mediaJobs.mediaId} = ${mediaAttempts.mediaId} and ${mediaJobs.claimToken} = ${mediaAttempts.token})`,
          ),
        )
        .orderBy(asc(mediaAttempts.nextAttemptAt))
        .limit(1)
        .for("update", { skipLocked: true });
      if (!attempt) return;
      selected = attempt.token;
      for (const key of attempt.objectKeys) await deleteMediaObject(key);
      if (attempt.cleanupReady) await tx.delete(mediaAttempts).where(eq(mediaAttempts.token, attempt.token));
      else
        await tx
          .update(mediaAttempts)
          .set({ nextAttemptAt: new Date(Date.now() + 60_000), errorId: null })
          .where(eq(mediaAttempts.token, attempt.token));
    });
  } catch (cause) {
    if (!selected) throw cause;
    const errorId = randomUUID();
    await db
      .update(mediaAttempts)
      .set({ errorId, nextAttemptAt: new Date(Date.now() + 60_000) })
      .where(eq(mediaAttempts.token, selected));
    logger.error(
      {
        code: "media_attempt_cleanup_pending",
        errorId,
        operation: "media.attempt_cleanup",
        status: 500,
        result: "keys_retained",
        cause: cause instanceof Error ? cause.name : "unknown",
        attempt: selected,
      },
      "media attempt cleanup pending",
    );
  }
}

export async function settleMediaAttempt(db: Database, token: string) {
  await db
    .update(mediaAttempts)
    .set({ cleanupReady: true, nextAttemptAt: new Date() })
    .where(eq(mediaAttempts.token, token));
  await processMediaAttemptCleanup(db, undefined, token);
}
