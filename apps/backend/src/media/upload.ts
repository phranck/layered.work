import { createHash, randomBytes } from "node:crypto";
import {
  type AcceptedImageType,
  type CreateUploadBody,
  ErrorCode,
  type UploadedMedia,
  type UploadTicket,
} from "@layered/schemas";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import sharp from "sharp";
import { mediaContentUrl } from "../account/repository.js";
import { auditActor } from "../auth/audit-actor.js";
import { auditLog, media, mediaJobs } from "../db/schema/index.js";
import { HttpError } from "../http/response.js";
import { logger } from "../logger.js";
import { deleteMediaObject, readMediaBytes, uploadTarget } from "./storage.js";
import { issueUploadToken, readUploadToken, SLUG_STEM_LENGTH } from "./upload-token.js";

/**
 * Putting a file into the media library: asking for an upload, and checking
 * what arrived.
 *
 * Nothing the browser declares is believed once the bytes can be read. The type
 * is what sharp decodes, the size is what was stored, and the checksum is what
 * decides whether the file is new.
 */

type Database = PostgresJsDatabase<Record<string, unknown>>;

/**
 * 16 random bytes, 22 base64url characters: a space of 2^128, so two uploads
 * meeting on one key is not an event to plan for, and the local writer opens
 * exclusively in case it ever is.
 */
const KEY_BYTES = 16;

/** How many numbered slugs are tried before an upload gives up on a name. */
const SLUG_ATTEMPTS = 50;

/** What sharp calls each accepted type. AVIF is decoded as HEIF with AV1 inside. */
const DECODED_TYPE: Record<string, AcceptedImageType> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heif: "image/avif",
};

/**
 * A file name reduced to what a slug may hold.
 *
 * The extension goes, accents fold to their letters, and everything that is
 * not a letter or a digit becomes one hyphen. The name reaches nothing else:
 * the storage key is generated, never derived from it.
 *
 * @param filename - As the reader's computer called the file.
 */
export function slugStem(filename: string): string {
  const stem = filename
    .replace(/\.[^.]*$/, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_STEM_LENGTH)
    .replace(/-+$/, "");
  return stem || "upload";
}

/**
 * Asks for an upload, and answers with where to send the bytes.
 *
 * @param request - The name, declared type and declared size, already validated.
 * @param userId - Who is asking, which the token records.
 */
export async function createUpload(request: CreateUploadBody, userId: string): Promise<UploadTicket> {
  const storageKey = `uploads/${randomBytes(KEY_BYTES).toString("base64url")}`;
  const token = issueUploadToken({
    storageKey,
    slug: slugStem(request.filename),
    type: request.type,
    size: request.size,
    userId,
  });
  const target = await uploadTarget({ storageKey, type: request.type, size: request.size, token });
  return { token, ...target };
}

/** Refuses an upload, after removing whatever it stored. */
async function refuse(storageKey: string, message: string, detail: Record<string, unknown>): Promise<never> {
  await deleteMediaObject(storageKey);
  logger.info({ storageKey, ...detail }, "upload refused");
  throw new HttpError(ErrorCode.InvalidRequest, message);
}

/**
 * Checks what arrived for an upload, and puts it in the library.
 *
 * @param db - The database.
 * @param token - The token the upload was asked for with.
 * @param userId - Who is completing it, who has to be who asked.
 * @returns The library picture, which is an existing one when the same file was
 *   already there.
 */
export async function completeUpload(
  db: Database,
  token: string,
  userId: string,
  actorTokenId?: string,
): Promise<UploadedMedia> {
  const claims = readUploadToken(token);
  if (!claims || claims.userId !== userId) {
    throw new HttpError(ErrorCode.InvalidRequest, "This upload is not valid, or it has expired.");
  }

  let bytes: Buffer;
  try {
    bytes = await readMediaBytes(claims.storageKey);
  } catch (cause) {
    throw new HttpError(ErrorCode.InvalidRequest, "Nothing arrived for this upload.", cause);
  }

  if (bytes.length !== claims.size) {
    return refuse(claims.storageKey, "The file that arrived is not the size it was said to be.", {
      declared: claims.size,
      measured: bytes.length,
    });
  }

  let decoded: { type: AcceptedImageType | undefined; width: number; height: number };
  try {
    const metadata = await sharp(bytes).metadata();
    decoded = {
      type: DECODED_TYPE[metadata.format ?? ""],
      // The dimensions a reader sees, with the photograph's rotation applied.
      width: metadata.autoOrient?.width ?? metadata.width ?? 0,
      height: metadata.autoOrient?.height ?? metadata.height ?? 0,
    };
  } catch {
    decoded = { type: undefined, width: 0, height: 0 };
  }
  if (decoded.type !== claims.type || decoded.width < 1 || decoded.height < 1) {
    return refuse(claims.storageKey, "The file is not the picture it was said to be.", {
      declared: claims.type,
      measured: decoded.type ?? "unreadable",
    });
  }

  const checksum = createHash("sha256").update(bytes).digest("hex");
  const [existing] = await db
    .select({ id: media.id, slug: media.slug, width: media.width, height: media.height })
    .from(media)
    .where(eq(media.checksum, checksum))
    .limit(1);
  if (existing) {
    await deleteMediaObject(claims.storageKey);
    logger.info({ storageKey: claims.storageKey, mediaId: existing.id }, "upload already in the library");
    return {
      id: existing.id,
      slug: existing.slug,
      url: mediaContentUrl(existing.id),
      width: existing.width ?? decoded.width,
      height: existing.height ?? decoded.height,
      existing: true,
    };
  }

  const row = await insertUnderFreeSlug(db, claims.slug, async (tx, slug) => {
    const [created] = await tx
      .insert(media)
      .values({
        slug,
        kind: "image",
        mimeType: claims.type,
        storageKey: claims.storageKey,
        byteSize: bytes.length,
        checksum,
        width: decoded.width,
        height: decoded.height,
      })
      .onConflictDoNothing({ target: media.slug })
      .returning({ id: media.id, slug: media.slug });
    if (created) {
      await tx.insert(mediaJobs).values({ mediaId: created.id });
      await tx.insert(auditLog).values({
        ...auditActor(userId, actorTokenId),
        action: "media.uploaded",
        subjectType: "media",
        subjectId: created.id,
      });
    }
    return created;
  });
  if (row) {
    logger.info({ storageKey: claims.storageKey, mediaId: row.id, bytes: bytes.length }, "upload stored");
    return {
      id: row.id,
      slug: row.slug,
      url: mediaContentUrl(row.id),
      width: decoded.width,
      height: decoded.height,
      existing: false,
    };
  }

  return refuse(claims.storageKey, "No free name could be found for this file.", { slug: claims.slug });
}

/**
 * Writes a new library row under the first free slug: the stem, then the stem
 * with a number.
 *
 * A slug that is taken is not an error. Each attempt is its own transaction, so
 * a taken slug costs one rolled-back insert and the row actually written is what
 * comes back.
 *
 * @param db - The database.
 * @param stem - The slug to start from, already reduced by `slugStem`.
 * @param write - Writes the row and whatever belongs with it under one slug,
 *   answering nothing when that slug is taken.
 * @returns The written row, or nothing when no free slug was found.
 */
export async function insertUnderFreeSlug<Row>(
  db: Database,
  stem: string,
  write: (
    tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
    slug: string,
  ) => Promise<Row | undefined>,
): Promise<Row | undefined> {
  for (let attempt = 1; attempt <= SLUG_ATTEMPTS; attempt++) {
    const slug = attempt === 1 ? stem : `${stem}-${attempt}`;
    const row = await db.transaction((tx) => write(tx, slug));
    if (row) return row;
  }
  return undefined;
}
