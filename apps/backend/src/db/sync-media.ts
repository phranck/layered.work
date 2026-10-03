import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { localMediaPath } from "../media/storage.js";
import { missingObjects } from "./verify-storage.js";

type Database = PostgresJsDatabase<Record<string, unknown>>;

export type SyncStore = {
  exists: (key: string) => Promise<boolean>;
  put: (key: string, bytes: Buffer, mimeType: string) => Promise<void>;
  read: (key: string) => Promise<Buffer>;
};

export async function syncMissingObjects(
  database: Database,
  root: string,
  store: SyncStore,
): Promise<string[]> {
  const missing = await missingObjects(database, store.exists);
  const ready: { file: (typeof missing)[number]; bytes: Buffer }[] = [];
  // Refuse a stale or damaged local library before changing any bucket object.
  for (const file of missing) {
    const bytes = await readFile(localMediaPath(root, file.storageKey));
    verifyBytes(file.storageKey, bytes, file.byteSize, file.checksum);
    ready.push({ file, bytes });
  }
  const uploaded: string[] = [];
  for (const { file, bytes } of ready) {
    await store.put(file.storageKey, bytes, file.mimeType);
    verifyBytes(file.storageKey, await store.read(file.storageKey), file.byteSize, file.checksum);
    uploaded.push(file.storageKey);
  }
  return uploaded;
}

function verifyBytes(storageKey: string, bytes: Buffer, size: number, checksum: string): void {
  if (bytes.length !== size || createHash("sha256").update(bytes).digest("hex") !== checksum) {
    throw new Error(`Media object ${storageKey} differs from its database record.`);
  }
}
