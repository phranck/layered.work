import { readFile } from "node:fs/promises";
import type { WatermarkAnchor } from "@layered/schemas";
import { eq } from "drizzle-orm";
import { WORDMARK } from "../assets.js";
import type { Database } from "../db/connect.js";
import { media } from "../db/schema/index.js";
import { readSiteSettings } from "../settings/repository.js";
import { readMediaBytes } from "./storage.js";
import { prepareMark, type Watermark } from "./variants.js";

/**
 * The mark a picture is derived with, or nothing for a picture without a watermark.
 *
 * The mark is the library picture the site settings name, and the site's
 * wordmark where they name none. Read per run rather than held, so a run started
 * after the mark changed uses the new one.
 *
 * @param db - The database.
 * @param anchor - The picture's watermark position, or null.
 */
export async function readWatermark(
  db: Pick<Database, "select">,
  anchor: WatermarkAnchor | null,
): Promise<Watermark | undefined> {
  if (!anchor) return undefined;
  const { watermarkMediaId } = await readSiteSettings(db);
  const [picture] = watermarkMediaId
    ? await db
        .select({ storageKey: media.storageKey })
        .from(media)
        .where(eq(media.id, watermarkMediaId))
        .limit(1)
    : [];
  const bytes = picture ? await readMediaBytes(picture.storageKey) : await readFile(WORDMARK);
  return { mark: await prepareMark(bytes), anchor };
}
