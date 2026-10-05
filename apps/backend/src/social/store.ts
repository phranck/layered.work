import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { RASTER_MIME_TYPES } from "../account/repository.js";
import type { database } from "../db/connect.js";
import { media } from "../db/schema/index.js";
import { logger } from "../logger.js";
import { deleteMediaObject, writeMediaBytes } from "../media/storage.js";
import { CARD_SIZE, renderSocialCard } from "./card.js";

type Writer = Pick<ReturnType<typeof database>, "select" | "insert">;

/** A featured asset must be a raster image a social client can show. */
export async function hasRasterPicture(db: Pick<Writer, "select">, mediaId: string | null): Promise<boolean> {
  if (!mediaId) return false;
  const [picture] = await db
    .select({ id: media.id })
    .from(media)
    .where(and(eq(media.id, mediaId), inArray(media.mimeType, RASTER_MIME_TYPES)))
    .limit(1);
  return Boolean(picture);
}

/** Only objects newly created by a failed transaction belong to its cleanup. */
export async function withCardObjects<T>(operation: (createdObjects: string[]) => Promise<T>): Promise<T> {
  const createdObjects: string[] = [];
  try {
    return await operation(createdObjects);
  } catch (cause) {
    for (const storageKey of createdObjects) {
      try {
        await deleteMediaObject(storageKey);
      } catch (cleanupError) {
        logger.error(
          {
            code: "SOCIAL_CARD_CLEANUP_FAILED",
            errorId: randomUUID(),
            operation: "rollback_social_card",
            status: 500,
            result: "object_retained",
            cause: cleanupError instanceof Error ? cleanupError.name : "UnknownError",
          },
          "social card rollback cleanup failed",
        );
      }
    }
    throw cause;
  }
}

/** Returns a stored media id, deduplicated by actual PNG bytes. Tracks new objects for rollback. */
export async function storeSocialCard(db: Writer, title: string, createdObjects: string[]): Promise<string> {
  const card = await renderSocialCard(title);
  const checksum = createHash("sha256").update(card.bytes).digest("hex");
  const find = async () =>
    (await db.select({ id: media.id }).from(media).where(eq(media.checksum, checksum)).limit(1))[0];
  const existing = await find();
  if (existing) return existing.id;
  const storageKey = `uploads/social-${randomUUID()}.png`;
  await writeMediaBytes(storageKey, card.bytes, "image/png");
  createdObjects.push(storageKey);
  const [stored] = await db
    .insert(media)
    .values({
      slug: `social-card-${checksum}`,
      kind: "image",
      mimeType: "image/png",
      storageKey,
      byteSize: card.bytes.length,
      checksum,
      ...CARD_SIZE,
    })
    .onConflictDoNothing()
    .returning({ id: media.id });
  if (!stored) {
    const concurrent = await find();
    if (!concurrent) throw new Error("The social card could not be stored.");
    await deleteMediaObject(storageKey);
    createdObjects.splice(createdObjects.indexOf(storageKey), 1);
    return concurrent.id;
  }
  logger.info(
    { operation: "generate_social_card", result: "stored", mediaId: stored.id, wordmark: card.wordmark },
    "social card generated and measured",
  );
  return stored.id;
}
