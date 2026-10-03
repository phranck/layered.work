import { asc } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { mediaObjectExists } from "../media/storage.js";
import { media } from "./schema/index.js";

type Database = PostgresJsDatabase<Record<string, unknown>>;

/** How many keys are asked about at once, so a large library does not open hundreds of requests together. */
const BATCH = 16;

/**
 * Every file in the library whose storage key names no object in the store it
 * is read from.
 *
 * Where this is not empty, the dashboard answers those pictures with an error
 * and the site links to addresses that do not exist, so `db:verify` fails on it.
 *
 * @param database - The database whose library is checked.
 * @param exists - Asks the store about one key; the store this process uses
 *   unless a test hands in another.
 * @returns The missing files, by slug and key, in the order of their slugs.
 */
export async function missingObjects(
  database: Database,
  exists: (storageKey: string) => Promise<boolean> = mediaObjectExists,
): Promise<{ slug: string; storageKey: string }[]> {
  const files = await database
    .select({ slug: media.slug, storageKey: media.storageKey })
    .from(media)
    .orderBy(asc(media.slug));
  const missing: { slug: string; storageKey: string }[] = [];
  for (let start = 0; start < files.length; start += BATCH) {
    const batch = files.slice(start, start + BATCH);
    const found = await Promise.all(batch.map((file) => exists(file.storageKey)));
    missing.push(...batch.filter((_, index) => !found[index]));
  }
  return missing;
}
