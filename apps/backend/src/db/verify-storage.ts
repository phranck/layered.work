import { asc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { mediaObjectExists } from "../media/storage.js";
import { media, mediaVariants } from "./schema/index.js";

type Database = PostgresJsDatabase<Record<string, unknown>>;

/** How many keys are asked about at once, so a large library does not open hundreds of requests together. */
const BATCH = 16;

/** Original files absent from the store, with the metadata needed to sync them from local media. */
export async function missingOriginalObjects(
  database: Database,
  exists: (storageKey: string) => Promise<boolean> = mediaObjectExists,
): Promise<{ slug: string; storageKey: string; mimeType: string; byteSize: number; checksum: string }[]> {
  const files = await database
    .select({
      slug: media.slug,
      storageKey: media.storageKey,
      mimeType: media.mimeType,
      byteSize: media.byteSize,
      checksum: media.checksum,
    })
    .from(media)
    .orderBy(asc(media.slug));
  const missing: typeof files = [];
  for (let start = 0; start < files.length; start += BATCH) {
    const batch = files.slice(start, start + BATCH);
    const found = await Promise.all(batch.map((file) => exists(file.storageKey)));
    missing.push(...batch.filter((_, index) => !found[index]));
  }
  return missing;
}

/** Every database storage key absent from the store, including derived image sizes. */
export async function missingObjects(
  database: Database,
  exists: (storageKey: string) => Promise<boolean> = mediaObjectExists,
): Promise<{ slug: string; storageKey: string }[]> {
  const originals = await missingOriginalObjects(database, exists);
  const variants = await database
    .select({
      slug: media.slug,
      width: mediaVariants.width,
      storageKey: mediaVariants.storageKey,
    })
    .from(mediaVariants)
    .innerJoin(media, eq(media.id, mediaVariants.mediaId))
    .orderBy(asc(media.slug), asc(mediaVariants.width));
  const missing: { slug: string; storageKey: string }[] = [...originals];
  for (let start = 0; start < variants.length; start += BATCH) {
    const batch = variants.slice(start, start + BATCH);
    const found = await Promise.all(batch.map((variant) => exists(variant.storageKey)));
    missing.push(
      ...batch
        .filter((_, index) => !found[index])
        .map((variant) => ({ slug: `${variant.slug}@${variant.width}w`, storageKey: variant.storageKey })),
    );
  }
  return missing;
}

/** Every object named by rendered content, including legacy downloads outside the media library. */
export async function missingRenderedObjects(
  paths: readonly string[],
  exists: (storageKey: string) => Promise<boolean> = mediaObjectExists,
): Promise<string[]> {
  const keys = [
    ...new Set(
      paths.map((path) => {
        if (typeof path !== "string" || !/^\/(?:migration|uploads)\/(?!.*\.\.)[a-zA-Z0-9_./-]+$/.test(path)) {
          throw new Error(`Rendered media path is not a storage key: ${path}`);
        }
        return path.slice(1);
      }),
    ),
  ].sort();
  const missing: string[] = [];
  for (let start = 0; start < keys.length; start += BATCH) {
    const batch = keys.slice(start, start + BATCH);
    const found = await Promise.all(batch.map(exists));
    missing.push(...batch.filter((_, index) => !found[index]));
  }
  return missing;
}
