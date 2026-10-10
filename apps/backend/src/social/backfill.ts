import { randomUUID } from "node:crypto";
import { isReadable, READABLE_STATES } from "@layered/schemas";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { closeDatabase, type Database, database } from "../db/connect.js";
import { entryTranslations } from "../db/schema/index.js";
import { logger } from "../logger.js";
import { hasRasterPicture, storeSocialCard, withCardObjects } from "./store.js";

/** Bring existing publications into the publish-time image pipeline before serving this deployment. */
export async function backfillSocialCards(db: Database, translationIds?: readonly string[]): Promise<number> {
  if (translationIds?.length === 0) return 0;
  const candidates = await db
    .select({ id: entryTranslations.id })
    .from(entryTranslations)
    .where(
      and(
        isNull(entryTranslations.socialCardMediaId),
        isNull(entryTranslations.trashedAt),
        inArray(entryTranslations.state, [...READABLE_STATES]),
        translationIds ? inArray(entryTranslations.id, [...translationIds]) : undefined,
      ),
    );
  let created = 0;
  for (const candidate of candidates) {
    created += await withCardObjects((createdObjects) =>
      db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(entryTranslations)
          .where(eq(entryTranslations.id, candidate.id))
          .for("update");
        if (!row || row.socialCardMediaId || row.trashedAt || !isReadable(row.state)) return 0;
        if (await hasRasterPicture(tx, row.featuredMediaId)) return 0;
        const socialCardMediaId = await storeSocialCard(tx, row.title, createdObjects);
        await tx.update(entryTranslations).set({ socialCardMediaId }).where(eq(entryTranslations.id, row.id));
        return 1;
      }),
    );
  }
  return created;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.stdout.write(`social cards prepared: ${await backfillSocialCards(database())}\n`);
  } catch (cause) {
    logger.error(
      {
        code: "SOCIAL_CARD_BACKFILL_FAILED",
        errorId: randomUUID(),
        operation: "backfill_social_cards",
        status: 503,
        result: "deployment_stopped",
        cause: cause instanceof Error ? cause.name : "UnknownError",
      },
      "social card backfill failed",
    );
    process.exitCode = 1;
  } finally {
    await closeDatabase();
  }
}
