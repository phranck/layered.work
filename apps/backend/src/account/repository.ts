import type { AccountMediaPage, AccountProfile, UpdateAccountBody } from "@layered/schemas";
import { ErrorCode } from "@layered/schemas";
import { and, asc, eq, ilike, inArray } from "drizzle-orm";
import type { database } from "../db/connect.js";
import { auditLog, media, users } from "../db/schema/index.js";
import { HttpError } from "../http/response.js";

const PAGE_SIZE = 24;
const RASTER_MIME_TYPES = ["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"] as const;
type Database = ReturnType<typeof database>;

function avatarUrl(id: string | null): string | null {
  return id ? `/api/account/media/${id}/content` : null;
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
        .where(
          and(
            eq(media.id, update.avatarMediaId),
            eq(media.kind, "image"),
            inArray(media.mimeType, RASTER_MIME_TYPES),
          ),
        )
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

/** Lists real raster images from the media library for the portrait chooser. */
export async function listAccountMedia(
  db: Database,
  query: { search: string; page: number },
): Promise<AccountMediaPage> {
  const filters = [eq(media.kind, "image"), inArray(media.mimeType, RASTER_MIME_TYPES)];
  if (query.search) filters.push(ilike(media.slug, `%${query.search}%`));

  const rows = await db
    .select({ id: media.id, slug: media.slug, width: media.width, height: media.height })
    .from(media)
    .where(and(...filters))
    .orderBy(asc(media.slug), asc(media.id))
    .limit(PAGE_SIZE + 1)
    .offset((query.page - 1) * PAGE_SIZE);

  return {
    items: rows.slice(0, PAGE_SIZE).map((row) => ({
      id: row.id,
      slug: row.slug,
      url: `/api/account/media/${row.id}/content`,
      width: row.width as number,
      height: row.height as number,
    })),
    page: query.page,
    hasMore: rows.length > PAGE_SIZE,
  };
}

/** Resolves a raster image to the private object-storage key used by the server. */
export async function getAccountMediaObject(
  db: Database,
  id: string,
): Promise<{ storageKey: string; mimeType: string }> {
  const [row] = await db
    .select({ storageKey: media.storageKey, mimeType: media.mimeType })
    .from(media)
    .where(and(eq(media.id, id), eq(media.kind, "image"), inArray(media.mimeType, RASTER_MIME_TYPES)))
    .limit(1);
  if (!row) throw new HttpError(ErrorCode.NotFound, "That image is not in the media library.");
  return row;
}
