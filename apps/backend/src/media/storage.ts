import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, readFile, rm, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config, isProduction } from "../config.js";

/**
 * Where a media object's bytes live.
 *
 * The bucket in production, always. Outside production, a machine with no
 * bucket configured keeps the same storage keys in a directory instead, so
 * local work shows and stores its pictures without reaching the production
 * bucket. The choice is made by the environment rather than by a value
 * happening to be missing, which is why production without a bucket refuses.
 */

let client: S3Client | undefined;

/** The repository's root, which a relative `MEDIA_LOCAL_DIR` is read against. */
export const REPOSITORY_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

/** How long a presigned upload address stays valid, in seconds. */
const UPLOAD_URL_SECONDS = 5 * 60;

/** Which of the two stores this process uses. */
export type StorageMode = { kind: "bucket"; bucket: string } | { kind: "local"; root: string };

/**
 * The store this process reads and writes.
 *
 * @throws When there is neither a bucket nor, outside production, a local
 *   directory, because a service that cannot store a file should say so on the
 *   first request rather than pretend.
 */
export function storageMode(): StorageMode {
  const { S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, MEDIA_LOCAL_DIR } = config;
  if (S3_ENDPOINT && S3_BUCKET && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY) {
    return { kind: "bucket", bucket: S3_BUCKET };
  }
  if (!isProduction && MEDIA_LOCAL_DIR)
    return { kind: "local", root: resolve(REPOSITORY_ROOT, MEDIA_LOCAL_DIR) };
  throw new Error("Object storage is not configured.");
}

/** The bucket client, opened when it is first wanted. */
function bucketClient(): S3Client {
  const { S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = config;
  client ??= new S3Client({
    endpoint: S3_ENDPOINT,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId: S3_ACCESS_KEY_ID ?? "", secretAccessKey: S3_SECRET_ACCESS_KEY ?? "" },
  });
  return client;
}

/**
 * The file a storage key names below a directory.
 *
 * The key comes from the database or from this server rather than from a
 * request, and it is still checked, because a path that leaves the directory
 * would read or write whatever the process can.
 *
 * @param root - The directory media are kept in.
 * @param storageKey - The object's key, such as `media/portrait.webp`.
 * @throws When the key is absolute or climbs out of the directory.
 */
export function localMediaPath(root: string, storageKey: string): string {
  const base = resolve(root);
  const path = resolve(base, storageKey);
  const inside = relative(base, path);
  if (isAbsolute(storageKey) || inside === "" || inside === ".." || inside.startsWith(`..${sep}`)) {
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

/** Reads a media object as a web stream without exposing storage credentials or URLs. */
export async function readMediaObject(storageKey: string): Promise<ReadableStream<Uint8Array>> {
  const mode = storageMode();
  if (mode.kind === "local") return readLocalMediaObject(mode.root, storageKey);
  const result = await bucketClient().send(new GetObjectCommand({ Bucket: mode.bucket, Key: storageKey }));
  if (!result.Body) throw new Error("Object storage returned no body.");
  return result.Body.transformToWebStream();
}

/**
 * Reads a whole media object into memory.
 *
 * For checking an upload, whose size is bounded by the upload limit before it
 * is read, so holding it at once is a known and small cost.
 *
 * @param storageKey - The object's key.
 */
export async function readMediaBytes(storageKey: string): Promise<Buffer> {
  const mode = storageMode();
  if (mode.kind === "local") return readFile(localMediaPath(mode.root, storageKey));
  const result = await bucketClient().send(new GetObjectCommand({ Bucket: mode.bucket, Key: storageKey }));
  if (!result.Body) throw new Error("Object storage returned no body.");
  return Buffer.from(await result.Body.transformToByteArray());
}

/** Writes a verified local file to the configured bucket. The sync command calls this only for absent keys. */
export async function writeBucketMediaBytes(
  storageKey: string,
  bytes: Buffer,
  mimeType: string,
): Promise<void> {
  const mode = storageMode();
  if (mode.kind !== "bucket") throw new Error("A bucket is required to sync local media.");
  await bucketClient().send(
    new PutObjectCommand({
      Bucket: mode.bucket,
      Key: storageKey,
      Body: bytes,
      ContentType: mimeType,
      ContentLength: bytes.length,
    }),
  );
}

/**
 * Whether the store this process reads holds an object at a key.
 *
 * Asks for the object's metadata rather than its bytes, so checking every key
 * in the library costs one small request each.
 *
 * @param storageKey - The object's key.
 */
export async function mediaObjectExists(storageKey: string): Promise<boolean> {
  const mode = storageMode();
  if (mode.kind === "local") {
    return stat(localMediaPath(mode.root, storageKey)).then(
      (found) => found.isFile(),
      () => false,
    );
  }
  try {
    await bucketClient().send(new HeadObjectCommand({ Bucket: mode.bucket, Key: storageKey }));
    return true;
  } catch (error) {
    if (error instanceof NotFound) return false;
    throw error;
  }
}

/**
 * Removes a media object. Removing one that is not there is not an error,
 * because the point is that it is gone.
 *
 * @param storageKey - The object's key.
 */
export async function deleteMediaObject(storageKey: string): Promise<void> {
  const mode = storageMode();
  if (mode.kind === "local") {
    await rm(localMediaPath(mode.root, storageKey), { force: true });
    return;
  }
  await bucketClient().send(new DeleteObjectCommand({ Bucket: mode.bucket, Key: storageKey }));
}

/**
 * Where the browser sends an upload's bytes, and the headers it has to send.
 *
 * With a bucket, a presigned `PUT` bound to the key, the type and the length,
 * so the bytes never pass through this process. Locally, this API's own upload
 * route, named relative to the API so the caller puts its own base in front.
 *
 * @param target - The object's key, its declared type and size, and the token
 *   the local route is addressed by.
 */
export async function uploadTarget(target: {
  storageKey: string;
  type: string;
  size: number;
  token: string;
}): Promise<{ url: string; headers: Record<string, string> }> {
  const mode = storageMode();
  const headers = { "Content-Type": target.type };
  if (mode.kind === "local") return { url: `/media/uploads/${target.token}/content`, headers };
  const url = await getSignedUrl(
    bucketClient(),
    new PutObjectCommand({
      Bucket: mode.bucket,
      Key: target.storageKey,
      ContentType: target.type,
      ContentLength: target.size,
    }),
    { expiresIn: UPLOAD_URL_SECONDS },
  );
  return { url, headers };
}

/**
 * Writes an upload's bytes into the local directory, refusing more than were
 * declared.
 *
 * The file is opened exclusively, so a second write to the same key fails
 * rather than replacing what the first one stored.
 *
 * @param root - The directory media are kept in.
 * @param storageKey - The object's key.
 * @param body - The request body.
 * @param maxBytes - The size the upload declared.
 * @returns How many bytes were written.
 * @throws When the body is larger than declared; the partial file is removed.
 */
export async function writeLocalMediaObject(
  root: string,
  storageKey: string,
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<number> {
  const path = localMediaPath(root, storageKey);
  await mkdir(dirname(path), { recursive: true });
  let written = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      written += chunk.length;
      callback(written > maxBytes ? new Error("The upload is larger than it declared.") : null, chunk);
    },
  });
  try {
    await pipeline(
      Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]),
      counter,
      createWriteStream(path, { flags: "wx" }),
    );
  } catch (error) {
    // A file that was already there is not this write's to remove.
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") await rm(path, { force: true });
    throw error;
  }
  return written;
}
