import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { connectOnce, databaseUrl } from "./connect.js";
import { activateMediaSyncBucket } from "./sync-media-env.js";

// Load the bucket modules after enabling the dedicated credentials. Ordinary
// local backend runs never expose them as S3_*, so they keep using media-local.
activateMediaSyncBucket(process.env);
const { config } = await import("../config.js");
const { mediaObjectExists, REPOSITORY_ROOT, readMediaBytes, storageMode, writeBucketMediaBytes } =
  await import("../media/storage.js");
const { syncMissingObjects } = await import("./sync-media.js");

/** The source is always the local development database. Production is the destination only for object bytes. */
const url = new URL(databaseUrl());
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
  throw new Error("Media sync requires the local development database.");
}
if (storageMode().kind !== "bucket") throw new Error("Media sync requires S3 credentials.");
if (!config.MEDIA_LOCAL_DIR) throw new Error("MEDIA_LOCAL_DIR is required for media sync.");

const sql = connectOnce();
try {
  const keys = await syncMissingObjects(drizzle(sql), resolve(REPOSITORY_ROOT, config.MEDIA_LOCAL_DIR), {
    exists: mediaObjectExists,
    put: writeBucketMediaBytes,
    read: readMediaBytes,
  });
  console.log(`Synced ${keys.length} media objects.`);
  for (const key of keys) console.log(key);
} finally {
  await sql.end({ timeout: 5 });
}
