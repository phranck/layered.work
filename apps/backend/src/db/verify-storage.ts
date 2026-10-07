import { asc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { mediaObjectExists } from "../media/storage.js";
import { media, mediaVariants } from "./schema/index.js";

type Database = PostgresJsDatabase<Record<string, unknown>>;
type MediaVariant = typeof mediaVariants.$inferSelect;

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
  return absentFrom(files, (file) => file.storageKey, exists);
}

/**
 * Derived image sizes absent from the store, with the metadata needed to sync them from local media.
 *
 * A size records its byte count and no checksum, so the count is all a restore can check it against.
 */
export async function missingVariantObjects(
  database: Database,
  exists: (storageKey: string) => Promise<boolean> = mediaObjectExists,
): Promise<
  { slug: string; width: number; format: MediaVariant["format"]; storageKey: string; byteSize: number }[]
> {
  const variants = await database
    .select({
      slug: media.slug,
      width: mediaVariants.width,
      format: mediaVariants.format,
      storageKey: mediaVariants.storageKey,
      byteSize: mediaVariants.byteSize,
    })
    .from(mediaVariants)
    .innerJoin(media, eq(media.id, mediaVariants.mediaId))
    .orderBy(asc(media.slug), asc(mediaVariants.width), asc(mediaVariants.format));
  return absentFrom(variants, (variant) => variant.storageKey, exists);
}

/** Every database storage key absent from the store, including derived image sizes. */
export async function missingObjects(
  database: Database,
  exists: (storageKey: string) => Promise<boolean> = mediaObjectExists,
): Promise<{ slug: string; storageKey: string }[]> {
  const originals = await missingOriginalObjects(database, exists);
  const variants = await missingVariantObjects(database, exists);
  return [
    ...originals,
    ...variants.map((variant) => ({
      slug: `${variant.slug}@${variant.width}w`,
      storageKey: variant.storageKey,
    })),
  ];
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
  return absentFrom(keys, (key) => key, exists);
}

/** The items whose storage key names no object in the store, in the order they were given. */
async function absentFrom<Item>(
  items: readonly Item[],
  keyOf: (item: Item) => string,
  exists: (storageKey: string) => Promise<boolean>,
): Promise<Item[]> {
  const missing: Item[] = [];
  for (let start = 0; start < items.length; start += BATCH) {
    const batch = items.slice(start, start + BATCH);
    const found = await Promise.all(batch.map((item) => exists(keyOf(item))));
    missing.push(...batch.filter((_, index) => !found[index]));
  }
  return missing;
}
