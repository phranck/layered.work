import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { localMediaPath } from "../media/storage.js";
import { variantMimeType } from "../media/variants.js";
import { missingOriginalObjects, missingVariantObjects } from "./verify-storage.js";

type Database = PostgresJsDatabase<Record<string, unknown>>;

export type SyncStore = {
  exists: (key: string) => Promise<boolean>;
  put: (key: string, bytes: Buffer, mimeType: string) => Promise<void>;
  read: (key: string) => Promise<Buffer>;
};

/**
 * One object the store is missing, and what its bytes have to match on either side of the upload.
 * A derived size records no checksum, so its byte count is the whole of the comparison.
 */
type SyncObject = { storageKey: string; mimeType: string; byteSize: number; checksum?: string };

/**
 * Puts every library object the store is missing back from the local media directory.
 *
 * Covers the originals and every derived size, because the bucket is filled again from this
 * machine and the site asks for the sizes rather than the originals. Every local file is checked
 * against its database record before the first upload, so a stale or damaged library changes
 * nothing in the store. Each uploaded object is read back and checked again.
 *
 * @param database - The local database, which names what the store should hold.
 * @param root - The local media directory the storage keys resolve against.
 * @param store - The store being filled, normally the production bucket.
 * @returns The storage keys uploaded, originals first.
 * @throws When a local file or an uploaded object differs from its database record.
 */
export async function syncMissingObjects(
  database: Database,
  root: string,
  store: SyncStore,
): Promise<string[]> {
  const originals = await missingOriginalObjects(database, store.exists);
  const variants = await missingVariantObjects(database, store.exists);
  const missing: SyncObject[] = [
    ...originals,
    ...variants.map(({ storageKey, format, byteSize }) => ({
      storageKey,
      mimeType: variantMimeType(format),
      byteSize,
    })),
  ];
  const ready: { file: SyncObject; bytes: Buffer }[] = [];
  for (const file of missing) {
    const bytes = await readFile(localMediaPath(root, file.storageKey));
    verifyBytes(file, bytes);
    ready.push({ file, bytes });
  }
  const uploaded: string[] = [];
  for (const { file, bytes } of ready) {
    await store.put(file.storageKey, bytes, file.mimeType);
    verifyBytes(file, await store.read(file.storageKey));
    uploaded.push(file.storageKey);
  }
  return uploaded;
}

function verifyBytes(file: SyncObject, bytes: Buffer): void {
  const sizeDiffers = bytes.length !== file.byteSize;
  const checksumDiffers =
    file.checksum !== undefined && createHash("sha256").update(bytes).digest("hex") !== file.checksum;
  if (sizeDiffers || checksumDiffers) {
    throw new Error(`Media object ${file.storageKey} differs from its database record.`);
  }
}
