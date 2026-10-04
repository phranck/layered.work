import { databaseUrl } from "./connect.js";
import { activateMediaSyncBucket, requireLocalMediaDatabase } from "./sync-media-env.js";

// Enable the dedicated bucket credentials before importing the verifier,
// whose storage module reads configuration when it is loaded.
requireLocalMediaDatabase(databaseUrl());
activateMediaSyncBucket(process.env);
const { storageMode } = await import("../media/storage.js");
if (storageMode().kind !== "bucket") throw new Error("Bucket verification requires S3 credentials.");
await import("./verify.js");
