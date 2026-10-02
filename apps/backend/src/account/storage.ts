import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config, isProduction } from "../config.js";

/**
 * Where a media object's bytes come from.
 *
 * The bucket in production, always. Outside production, a machine with no
 * bucket configured reads the same storage keys from a directory instead, so
 * local work shows its pictures without reaching the production bucket. The
 * choice is made by the environment rather than by a value happening to be
 * missing, which is why production without a bucket still refuses.
 */

let client: S3Client | undefined;

/** The repository's root, which a relative `MEDIA_LOCAL_DIR` is read against. */
const REPOSITORY_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

/** The bucket's settings, or nothing when no bucket is configured. */
function bucketConfig() {
  const {
    S3_ENDPOINT: endpoint,
    S3_BUCKET: bucket,
    S3_ACCESS_KEY_ID: accessKeyId,
    S3_SECRET_ACCESS_KEY: secretAccessKey,
  } = config;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return undefined;
  return { endpoint, bucket, accessKeyId, secretAccessKey };
}

/**
 * The file a storage key names below a directory.
 *
 * The key comes from the database rather than from a request, and it is still
 * checked, because a path that leaves the directory would read whatever the
 * process can.
 *
 * @param root - The directory media are kept in.
 * @param storageKey - The object's key, such as `media/portrait.webp`.
 * @throws When the key is absolute or climbs out of the directory.
 */
export function localMediaPath(root: string, storageKey: string): string {
  const base = resolve(root);
  const path = resolve(base, storageKey);
  const inside = relative(base, path);
  if (isAbsolute(storageKey) || inside === "" || inside.startsWith(`..${sep}`) || inside === "..") {
    throw new Error("A storage key may not leave the media directory.");
  }
  return path;
}

/**
 * Reads a media object from a directory on this machine.
 *
 * @param root - The directory media are kept in.
 * @param storageKey - The object's key.
 */
export async function readLocalMediaObject(
  root: string,
  storageKey: string,
): Promise<ReadableStream<Uint8Array>> {
  const path = localMediaPath(root, storageKey);
  await access(path);
  return Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>;
}

/** Reads a private object as a web stream without exposing storage credentials or URLs. */
export async function readAccountMediaObject(storageKey: string): Promise<ReadableStream<Uint8Array>> {
  const settings = bucketConfig();
  if (!settings) {
    if (isProduction || !config.MEDIA_LOCAL_DIR) throw new Error("Object storage is not configured.");
    return readLocalMediaObject(resolve(REPOSITORY_ROOT, config.MEDIA_LOCAL_DIR), storageKey);
  }
  client ??= new S3Client({
    endpoint: settings.endpoint,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
    },
  });
  const result = await client.send(new GetObjectCommand({ Bucket: settings.bucket, Key: storageKey }));
  if (!result.Body) throw new Error("Object storage returned no body.");
  return result.Body.transformToWebStream();
}
