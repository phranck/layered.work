import {
  ErrorCode,
  type MediaDetail,
  type MediaLibraryItem,
  type MediaLibraryPage,
  type MediaLibraryQuery,
  noMediaDescriptions,
  type SaveMediaMetadataBody,
  SITE_PICTURE_SETTINGS,
  saveMediaMetadataBody,
} from "@layered/schemas";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { mediaContentUrl } from "../account/repository.js";
import { auditActor } from "../auth/audit-actor.js";
import type { Database } from "../db/connect.js";
import { containing } from "../db/like.js";
import {
  auditLog,
  entries,
  entryTranslations,
  homeBlocks,
  media,
  mediaJobs,
  mediaReferences,
  mediaTranslations,
  settingMediaReferences,
  settings,
  unsplashPhotos,
  users,
} from "../db/schema/index.js";
import { HttpError } from "../http/response.js";
import { SITE_PICTURES } from "../settings/site-pictures.js";
import { isRasterImage, storedInLibrary } from "./pictures.js";
import { getMediaProcessing } from "./processing.js";
import { queueMediaProcessing } from "./queue.js";
import { namesPictureInBlock, namesSitePicture, unusedMedia } from "./usage.js";

/** How many files one page of the library holds. */
const LIBRARY_PAGE_SIZE = 24;
/**
 * What each order sorts by. The id comes last in both, so two files with the same
 * slug or the same upload time fall on the same side of a page boundary on every
 * request.
 */
const ORDERING = {
  slug: [asc(media.slug), asc(media.id)],
  newest: [desc(media.uploadedAt), asc(media.id)],
} as const;
const selection = {
  id: media.id,
  slug: media.slug,
  kind: media.kind,
  mimeType: media.mimeType,
  byteSize: media.byteSize,
  width: media.width,
  height: media.height,
  uploadedAt: media.uploadedAt,
  focalX: media.focalX,
  focalY: media.focalY,
  processingState: mediaJobs.state,
};
type Row = Omit<MediaLibraryItem, "uploadedAt" | "url" | "focalPoint" | "processingState"> & {
  uploadedAt: Date;
  focalX: number;
  focalY: number;
  processingState: MediaLibraryItem["processingState"] | null;
};
function item(row: Row): MediaLibraryItem {
  const { focalX, focalY, ...rest } = row;
  return {
    ...rest,
    uploadedAt: row.uploadedAt.toISOString(),
    focalPoint: { x: focalX, y: focalY },
    processingState: row.processingState ?? "ready",
    url: isRasterImage(row) ? mediaContentUrl(row.id) : null,
  };
}
export async function listMedia(db: Database, query: MediaLibraryQuery): Promise<MediaLibraryPage> {
  const pattern = containing(query.search);
  const described = sql`exists (select 1 from ${mediaTranslations} as "description" where "description"."media_id" = ${media.id} and ("description"."alt_text" ilike ${pattern} or "description"."caption" ilike ${pattern}))`;
  const rows = await db
    .select(selection)
    .from(media)
    .leftJoin(mediaJobs, eq(mediaJobs.mediaId, media.id))
    .where(
      and(
        query.kind === "all" ? undefined : eq(media.kind, query.kind),
        query.search ? or(ilike(media.slug, pattern), described) : undefined,
        query.unused ? unusedMedia() : undefined,
      ),
    )
    .orderBy(...ORDERING[query.order])
    .limit(LIBRARY_PAGE_SIZE + 1)
    .offset((query.page - 1) * LIBRARY_PAGE_SIZE);
  return {
    items: rows.slice(0, LIBRARY_PAGE_SIZE).map(item),
    page: query.page,
    hasMore: rows.length > LIBRARY_PAGE_SIZE,
  };
}
/** Includes body references and both cover roles, regardless of publication or trash state. */
export async function getMediaUses(db: Pick<Database, "select">, id: string): Promise<MediaDetail["uses"]> {
  const uses: MediaDetail["uses"] = await db
    .select({
      id: entryTranslations.id,
      title: entryTranslations.title,
      language: entryTranslations.language,
      kind: entries.kind,
    })
    .from(entryTranslations)
    .innerJoin(entries, eq(entries.id, entryTranslations.entryId))
    .where(
      or(
        eq(entryTranslations.featuredMediaId, id),
        eq(entryTranslations.socialCardMediaId, id),
        sql`exists (select 1 from ${mediaReferences} as "reference" where "reference"."translation_id" = ${entryTranslations.id} and "reference"."media_id" = ${id})`,
      ),
    )
    .orderBy(asc(entryTranslations.title), asc(entryTranslations.language));
  const portraits = await db
    .select({ id: users.id, title: users.displayName, language: users.interfaceLanguage })
    .from(users)
    .where(eq(users.avatarMediaId, id));
  uses.push(...portraits.map((portrait) => ({ ...portrait, kind: "account" as const })));
  const [site] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(and(eq(settings.key, "site"), namesSitePicture(id)));
  const named = (site?.value ?? {}) as Record<string, unknown>;
  for (const key of SITE_PICTURE_SETTINGS)
    if (named[key] === id) uses.push({ id, title: SITE_PICTURES[key].use, language: "en", kind: "settings" });
  const blocks = await db
    .select({ id: homeBlocks.id, type: homeBlocks.type })
    .from(homeBlocks)
    .where(namesPictureInBlock(id));
  for (const block of blocks)
    uses.push({ id: block.id, title: `Home page block ${block.type}`, language: "en", kind: "settings" });
  const introductions = await db
    .select({ key: settingMediaReferences.settingsKey, language: settingMediaReferences.language })
    .from(settingMediaReferences)
    .where(eq(settingMediaReferences.mediaId, id));
  for (const introduction of introductions)
    uses.push({
      id,
      kind: "settings",
      language: introduction.language,
      title: `${introduction.key === "postListing" ? "Post" : introduction.key === "projectListing" ? "Project" : "Listing"} introduction`,
      ...(introduction.key === "postListing" || introduction.key === "projectListing"
        ? { settingsGroup: introduction.key }
        : {}),
    });
  return uses;
}
export async function getMediaDetail(db: Database, id: string): Promise<MediaDetail> {
  const [found] = await db
    .select({
      ...selection,
      watermark: media.watermark,
      photographer: unsplashPhotos.photographerName,
      profileUrl: unsplashPhotos.photographerUrl,
    })
    .from(media)
    .leftJoin(mediaJobs, eq(mediaJobs.mediaId, media.id))
    .leftJoin(unsplashPhotos, eq(unsplashPhotos.mediaId, media.id))
    .where(eq(media.id, id));
  if (!found) throw new HttpError(ErrorCode.NotFound, "That file is not in the media library.");
  const { watermark, photographer, profileUrl, ...row } = found;
  const translations = noMediaDescriptions();
  for (const translation of await db
    .select()
    .from(mediaTranslations)
    .where(eq(mediaTranslations.mediaId, id)))
    translations[translation.language] = { altText: translation.altText, caption: translation.caption };
  return {
    ...item(row),
    translations,
    processing: await getMediaProcessing(db, id),
    uses: await getMediaUses(db, id),
    watermark,
    credit: photographer && profileUrl ? { photographer, profileUrl } : null,
  };
}
export async function saveMediaMetadata(
  db: Database,
  id: string,
  input: SaveMediaMetadataBody,
  actor?: { userId: string; tokenId?: string },
): Promise<MediaDetail> {
  const value = saveMediaMetadataBody.parse(input);
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select({
        kind: media.kind,
        mimeType: media.mimeType,
        watermark: media.watermark,
        stored: sql<boolean>`${storedInLibrary()}`,
      })
      .from(media)
      .where(eq(media.id, id))
      .for("update");
    if (!before) throw new HttpError(ErrorCode.NotFound, "That file is not in the media library.");
    const watermark = value.watermark === undefined ? before.watermark : value.watermark;
    // The mark is laid into sizes derived from the stored bytes, which a picture from Unsplash does not have.
    if (watermark && !(isRasterImage(before) && before.stored))
      throw new HttpError(
        ErrorCode.InvalidRequest,
        "Only a raster image uploaded here can carry a watermark.",
      );
    await tx
      .update(media)
      .set({ focalX: value.focalPoint.x, focalY: value.focalPoint.y, watermark })
      .where(eq(media.id, id));
    // The mark lives in the derived sizes, so a moved or removed mark means new sizes.
    if (watermark !== before.watermark) await queueMediaProcessing(tx, [id]);
    for (const translation of value.translations) {
      if (translation.altText === null && translation.caption === null) {
        await tx
          .delete(mediaTranslations)
          .where(
            and(eq(mediaTranslations.mediaId, id), eq(mediaTranslations.language, translation.language)),
          );
      } else {
        await tx
          .insert(mediaTranslations)
          .values({ mediaId: id, ...translation })
          .onConflictDoUpdate({
            target: [mediaTranslations.mediaId, mediaTranslations.language],
            set: { altText: translation.altText, caption: translation.caption },
          });
      }
    }
    if (actor)
      await tx.insert(auditLog).values({
        ...auditActor(actor.userId, actor.tokenId),
        action: "media.metadata_updated",
        subjectType: "media",
        subjectId: id,
      });
  });
  return getMediaDetail(db, id);
}
