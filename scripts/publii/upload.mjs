/**
 * Puts the migrated media into the object storage and reads every object back.
 *
 * The only step of this pipeline that talks to the network. Everything before
 * it stays local by design, so this is a separate command rather than part of
 * `run.mjs`: a repeatable local run must not depend on credentials, and an
 * upload must not happen because somebody rebuilt the export.
 *
 * **Under one prefix.** Every object is written below `migration/`, so the
 * whole set can be listed, counted and removed again without touching anything
 * the dashboard uploads later.
 *
 * **Only what a page names.** Publii's own responsive copies and its gallery
 * thumbnails are superseded by the variants this site generates, and its file
 * manager holds uploads that no entry ever referenced. None of them is written;
 * all of them are counted in the report, because a file left out silently looks
 * exactly like a file that failed.
 *
 * ```sh
 * node scripts/publii/upload.mjs --dry-run
 * node scripts/publii/upload.mjs
 * ```
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

/** Where everything this run writes lives, so it can be removed as one thing. */
const PREFIX = "migration/";

const { values } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    output: { type: "string", default: "migration-out" },
    "media-output": { type: "string", default: "apps/website/public/media" },
  },
});

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/**
 * Reads a whole object back into memory.
 *
 * The verification compares checksums, and a checksum needs the bytes. The
 * largest object here is under 10 MB, so this reads one at a time rather than
 * streaming, which would be the right answer at a different scale.
 */
async function objectBytes(body) {
  const chunks = [];
  for await (const chunk of body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/**
 * Every slug an entry names, by any of the ways the content language names one.
 *
 * A component argument, a `slug:` parameter, an entry's featured image, or a
 * plain link to `/media/…`. Anything outside that list is not reachable from a
 * page, which is what decides whether it is uploaded.
 */
function namedSlugs(site) {
  const named = new Set();
  for (const entry of site.entries) {
    for (const match of entry.body.matchAll(/(?:Image|Model|Video|Figure)\("([^"]+)"/g)) named.add(match[1]);
    for (const match of entry.body.matchAll(/slug:\s*"([^"]+)"/g)) named.add(match[1]);
    for (const match of entry.body.matchAll(/\/media\/([a-z0-9-]+)\./g)) named.add(match[1]);
    if (entry.featuredImage) named.add(entry.featuredImage);
  }
  return named;
}

/** Why a file was left out, in the words the report uses. */
function reasonFor(item) {
  if (item.source.includes("/responsive/"))
    return "Publii's own responsive copy, superseded by the generated variants";
  if (item.filename.includes("-thumbnail."))
    return "Publii's own gallery thumbnail, superseded by the generated variants";
  return "in the file manager but named by no entry and no generated page";
}

/**
 * What goes up and what stays behind, decided from the export alone.
 *
 * Exported so a test can ask the question without a bucket, credentials or a
 * network: the choice of what to publish is the part that can be wrong.
 *
 * @param site - The parsed `site.json`.
 * @param report - The parsed `media-report.json`.
 * @returns The objects to write, each with the key, size and hash it must have,
 *   and everything left out with the reason it was.
 */
export function selectObjects(site, report) {
  const named = namedSlugs(site);
  const originals = site.media.filter((item) => named.has(item.slug));
  const skipped = site.media
    .filter((item) => !named.has(item.slug))
    .map((item) => ({ slug: item.slug, bytes: item.bytes, reason: reasonFor(item) }));
  const variants = report.variants.filter((variant) =>
    [...named].some((slug) => variant.src.startsWith(`/media/${slug}-variant-`)),
  );
  const objects = [
    ...originals.map((item) => ({
      key: `${PREFIX}${basename(item.src)}`,
      filename: basename(item.src),
      mime: item.mime,
      bytes: item.bytes,
      sha256: item.sha256,
    })),
    ...variants.map((variant) => ({
      key: `${PREFIX}${basename(variant.src)}`,
      filename: basename(variant.src),
      mime: "image/webp",
      bytes: variant.bytes,
      sha256: variant.sha256,
    })),
  ];
  const keys = new Set(objects.map((object) => object.key));
  assert.equal(keys.size, objects.length, "Two objects would be written to one key");
  return { objects, skipped };
}

// Everything below runs only when this file is the command, so that importing it
// for a test neither reads the export nor opens a connection.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const outputDirectory = resolve(values.output);
  const mediaDirectory = resolve(values["media-output"]);
  const site = JSON.parse(await readFile(resolve(outputDirectory, "site.json"), "utf8"));
  const report = JSON.parse(await readFile(resolve(outputDirectory, "media-report.json"), "utf8"));

  const { objects, skipped } = selectObjects(site, report);
  const plannedBytes = objects.reduce((total, object) => total + object.bytes, 0);
  const skippedBytes = skipped.reduce((total, item) => total + item.bytes, 0);

  if (values["dry-run"]) {
    process.stdout.write(
      `${JSON.stringify(
        {
          prefix: PREFIX,
          wouldUpload: objects.length,
          wouldUploadBytes: plannedBytes,
          skipped: skipped.length,
          skippedBytes,
          firstKeys: objects.slice(0, 3).map((object) => object.key),
        },
        null,
        2,
      )}\n`,
    );
    process.exit(0);
  }

  for (const name of ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]) {
    assert(process.env[name], `${name} must be set to upload. It is empty, so nothing was written.`);
  }

  const client = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? "us-east-1",
    // Zerops speaks the path style, where the bucket is part of the path rather
    // than of the hostname. The virtual-hosted style would address a host that
    // does not exist.
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
  });
  const Bucket = process.env.S3_BUCKET;

  const verified = [];
  for (const object of objects) {
    const body = await readFile(resolve(mediaDirectory, object.filename));
    assert.equal(
      sha256(body),
      object.sha256,
      `Staged file no longer matches its recorded hash: ${object.key}`,
    );
    await client.send(
      new PutObjectCommand({ Bucket, Key: object.key, Body: body, ContentType: object.mime }),
    );

    // Read back rather than trust the write. A successful PUT says the request
    // was accepted; it does not say what is stored under that key now.
    const head = await client.send(new HeadObjectCommand({ Bucket, Key: object.key }));
    assert.equal(head.ContentLength, object.bytes, `Stored size differs: ${object.key}`);
    const stored = await objectBytes(
      (await client.send(new GetObjectCommand({ Bucket, Key: object.key }))).Body,
    );
    assert.equal(sha256(stored), object.sha256, `Stored checksum differs: ${object.key}`);
    verified.push({ key: object.key, bytes: object.bytes, sha256: object.sha256 });
  }

  /** What the bucket holds under the prefix now, asked of the bucket itself. */
  const listed = [];
  let token;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket, Prefix: PREFIX, ContinuationToken: token }),
    );
    for (const item of page.Contents ?? []) listed.push({ key: item.Key, bytes: item.Size });
    token = page.NextContinuationToken;
  } while (token);

  const uploadReport = {
    prefix: PREFIX,
    uploaded: verified.length,
    uploadedBytes: plannedBytes,
    checksumVerification:
      "every uploaded object read back and compared by size and SHA-256 against its source",
    presentUnderPrefix: listed.length,
    presentBytes: listed.reduce((total, item) => total + item.bytes, 0),
    skipped,
    skippedBytes,
  };
  await writeFile(
    resolve(outputDirectory, "upload-report.json"),
    `${JSON.stringify(uploadReport, null, 2)}\n`,
  );
  process.stdout.write(`${JSON.stringify({ ...uploadReport, skipped: skipped.length }, null, 2)}\n`);
}
