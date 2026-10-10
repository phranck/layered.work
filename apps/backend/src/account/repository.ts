import type { AccountProfile, UpdateAccountBody } from "@layered/schemas";
import { ErrorCode } from "@layered/schemas";
import { and, eq } from "drizzle-orm";
import type { Database } from "../db/connect.js";
import { auditLog, media, unsplashPhotos, users } from "../db/schema/index.js";
import { HttpError } from "../http/response.js";
import { rasterImage } from "../media/pictures.js";
import { unsplashImageUrl } from "../unsplash/client.js";

/**
 * The address the dashboard reads a library picture from, through this API.
 *
 * One function, because the picker, the portrait and an upload all hand the
 * same address to the same browser, and a second spelling of it is a picture
 * that loads in one place and not in another.
 *
 * @param id - The media row.
 */
export function mediaContentUrl(id: string): string {
  return `/api/account/media/${id}/content`;
}

function avatarUrl(id: string | null): string | null {
  return id ? mediaContentUrl(id) : null;
}

function asProfile(row: Omit<AccountProfile, "avatarUrl">): AccountProfile {
  return { ...row, avatarUrl: avatarUrl(row.avatarMediaId) };
}

const profileSelection = {
  id: users.id,
  email: users.email,
  displayName: users.displayName,
  role: users.role,
  interfaceLanguage: users.interfaceLanguage,
  avatarMediaId: users.avatarMediaId,
};

/** Reads one authenticated user's account row. */
export async function getAccountProfile(db: Database, userId: string): Promise<AccountProfile> {
  const [row] = await db.select(profileSelection).from(users).where(eq(users.id, userId)).limit(1);
  if (!row) throw new HttpError(ErrorCode.NotFound, "This account no longer exists.");
  return asProfile(row);
}

/** Updates editable fields and records which fields changed, without recording their values. */
export async function updateAccountProfile(
  db: Database,
  userId: string,
  update: UpdateAccountBody,
): Promise<AccountProfile> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select(profileSelection).from(users).where(eq(users.id, userId)).limit(1);
    if (!current) throw new HttpError(ErrorCode.NotFound, "This account no longer exists.");

    if (update.avatarMediaId) {
      const [avatar] = await tx
        .select({ id: media.id })
        .from(media)
        .where(and(eq(media.id, update.avatarMediaId), rasterImage()))
        .limit(1);
      if (!avatar) {
        throw new HttpError(ErrorCode.InvalidRequest, "Choose an existing raster image for the portrait.");
      }
    }

    const changedKeys = (["displayName", "email", "interfaceLanguage", "avatarMediaId"] as const).filter(
      (key) => current[key] !== update[key],
    );
    const [saved] = await tx
      .update(users)
      .set(update)
      .where(eq(users.id, userId))
      .returning(profileSelection);
    if (!saved) throw new HttpError(ErrorCode.NotFound, "This account no longer exists.");

    if (changedKeys.length > 0) {
      await tx.insert(auditLog).values({
        actorUserId: userId,
        action: "account.updated",
        subjectType: "users",
        subjectId: userId,
        detail: { changedKeys },
      });
    }

    return asProfile(saved);
  });
}

/** Resolves a raster image to the private object-storage key used by the server. */
export async function getAccountMediaObject(
  db: Database,
  id: string,
): Promise<{ storageKey: string; mimeType: string; hotlink: string | null }> {
  const [row] = await db
    .select({ storageKey: media.storageKey, mimeType: media.mimeType, imageUrl: unsplashPhotos.imageUrl })
    .from(media)
    .leftJoin(unsplashPhotos, eq(unsplashPhotos.mediaId, media.id))
    .where(and(eq(media.id, id), rasterImage()))
    .limit(1);
  if (!row) throw new HttpError(ErrorCode.NotFound, "That image is not in the media library.");
  const { imageUrl, ...object } = row;
  // A picture from Unsplash has no bytes here, and Unsplash requires it to be
  // loaded from its own address, so the dashboard is sent there instead.
  return { ...object, hotlink: imageUrl ? unsplashImageUrl(imageUrl, DASHBOARD_PREVIEW_WIDTH) : null };
}

/** The width the dashboard is given an Unsplash picture at: large enough for the focal point editor. */
const DASHBOARD_PREVIEW_WIDTH = 1080;
