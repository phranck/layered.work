import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { media, mediaAttempts, mediaJobs, mediaVariants } from "../db/schema/index.js";
import { logger } from "../logger.js";
import { processMediaAttemptCleanup, settleMediaAttempt } from "./attempts.js";
import { deleteMediaObject, readMediaBytes, writeMediaBytes } from "./storage.js";
import { deriveImageVariants } from "./variants.js";

type Database = PostgresJsDatabase<Record<string, unknown>>;
const LEASE_MS = 300_000;
const lease = () => new Date(Date.now() + LEASE_MS);

/** Claim and process one durable job. The optional ID restricts administrative/test work. */
export async function processMediaJob(db: Database, id?: string): Promise<boolean> {
  const token = randomUUID();
  const job = await db.transaction(async (tx) => {
    const [candidate] = await tx
      .select()
      .from(mediaJobs)
      .where(
        and(
          id ? eq(mediaJobs.mediaId, id) : undefined,
          sql`${mediaJobs.state} = 'queued' or (${mediaJobs.state} = 'processing' and ${mediaJobs.leaseExpiresAt} < now())`,
        ),
      )
      .orderBy(asc(mediaJobs.createdAt))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!candidate) return undefined;
    await tx
      .update(mediaJobs)
      .set({ state: "processing", claimToken: token, leaseExpiresAt: lease(), errorId: null })
      .where(eq(mediaJobs.mediaId, candidate.mediaId));
    await tx.insert(mediaAttempts).values({ token, mediaId: candidate.mediaId });
    return candidate;
  });
  if (!job) {
    await processMediaAttemptCleanup(db, id);
    return false;
  }
  const owned = and(eq(mediaJobs.mediaId, job.mediaId), eq(mediaJobs.claimToken, token));
  const keys: string[] = [];
  let published = false;
  const heartbeat = setInterval(() => {
    void db
      .update(mediaJobs)
      .set({ leaseExpiresAt: lease() })
      .where(owned)
      .catch(() => {
        logger.error(
          {
            code: "media_lease_failed",
            errorId: randomUUID(),
            operation: "media.processing",
            status: 500,
            result: "lease_not_extended",
            mediaId: job.mediaId,
          },
          "media lease failed",
        );
      });
  }, LEASE_MS / 3);
  heartbeat.unref();
  try {
    // Only objects registered by the abandoned attempt are reclaimed.
    for (const key of job.objectKeys) await deleteMediaObject(key);
    const [original] = await db
      .select({ storageKey: media.storageKey })
      .from(media)
      .where(eq(media.id, job.mediaId));
    if (!original) throw new Error("media removed");
    const result = await deriveImageVariants(await readMediaBytes(original.storageKey));
    const variants = result.variants.map((variant) => ({
      ...variant,
      storageKey: `variants/${job.mediaId}/${token}/${createHash("sha256").update(variant.bytes).digest("hex")}.${variant.format}`,
    }));
    keys.push(...variants.map(({ storageKey }) => storageKey));
    const reserved = await db.transaction(async (tx) => {
      const current = await tx
        .update(mediaJobs)
        .set({ objectKeys: keys, leaseExpiresAt: lease() })
        .where(owned)
        .returning();
      if (current.length)
        await tx.update(mediaAttempts).set({ objectKeys: keys }).where(eq(mediaAttempts.token, token));
      return current;
    });
    if (!reserved.length) return true;
    for (const variant of variants)
      await writeMediaBytes(variant.storageKey, variant.bytes, `image/${variant.format}`);
    published = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(mediaJobs).where(owned).for("update");
      if (!current) return false;
      if (variants.length)
        await tx.insert(mediaVariants).values(
          variants.map(({ bytes, ...variant }) => ({
            ...variant,
            mediaId: job.mediaId,
            byteSize: bytes.length,
          })),
        );
      await tx.update(media).set({ placeholder: result.placeholder }).where(eq(media.id, job.mediaId));
      await tx.update(mediaJobs).set({ state: "ready", leaseExpiresAt: null }).where(owned);
      await tx.delete(mediaAttempts).where(eq(mediaAttempts.token, token));
      return true;
    });
  } catch (cause) {
    const errorId = randomUUID();
    await db.update(mediaJobs).set({ state: "failed", errorId, leaseExpiresAt: null }).where(owned);
    logger.error(
      {
        code: "media_processing_failed",
        errorId,
        operation: "media.processing",
        mediaId: job.mediaId,
        status: 500,
        result: "failed",
        cause: cause instanceof Error ? cause.name : "unknown",
      },
      "media processing failed",
    );
  } finally {
    clearInterval(heartbeat);
    if (!published) await settleMediaAttempt(db, token);
  }
  return true;
}
