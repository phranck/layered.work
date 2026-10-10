import { resolveValues } from "@layered/content";
import { type EntryPreview, ErrorCode, languagePath, type PreviewEntryBody } from "@layered/schemas";
import { and, eq, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import { auditActor } from "../auth/audit-actor.js";
import { claimsToken } from "../auth/signature.js";
import { config } from "../config.js";
import {
  type PublicSnapshot,
  publicEntry,
  publicForms,
  publicMedia,
  publicTopics,
} from "../content/snapshot.js";
import type { Database } from "../db/connect.js";
import {
  auditLog,
  entries,
  entryPreviews,
  entryTopics,
  entryTranslations,
  paths,
} from "../db/schema/index.js";
import { HttpError } from "../http/response.js";
import { mainNavigationFromGroups, readPublicNavigation } from "../navigation/public.js";
import { readListingSettings, readPublicSiteFrame } from "../settings/repository.js";
import { readValueMap, resolveListingIntroductions } from "../values/repository.js";

/**
 * Previews: an entry as a reader would see it, from what the editor holds.
 *
 * A preview is a row holding the editor's text and a signed token naming that
 * row. The token is what the link carries, so the link works in any browser
 * without opening anything else, and it is signed with a key derived for this
 * purpose alone, so no token of another kind passes as one of these.
 */

/** How long a preview link works. Long enough to read, short enough to forget. */
export const PREVIEW_LIFETIME_MS = 60 * 60 * 1000;

/** Preview tokens, which name the preview row and nothing else. */
const previewTokens = claimsToken("entry-preview", z.strictObject({ previewId: z.uuid() }));

/**
 * Issues the token for one preview.
 *
 * @param previewId - The row it names.
 * @param expiresAt - When it stops working, in milliseconds since the epoch.
 */
export function issuePreviewToken(previewId: string, expiresAt: number): string {
  return previewTokens.issue({ previewId }, expiresAt);
}

/**
 * Reads a preview token back, or refuses it.
 *
 * @param token - As it arrived.
 * @param now - The current time, which a test can fix.
 * @returns The preview it names, or null when the signature is not this
 *   server's, the token is of another kind, or it has expired. One answer for
 *   all three, so a caller learns nothing about which.
 */
export function readPreviewToken(token: string, now = Date.now()): string | null {
  return previewTokens.read(token, now)?.previewId ?? null;
}

/**
 * Keeps what the editor holds for one translation as a preview, and returns the
 * address that shows it.
 *
 * Previews past their expiry are removed here, so the table never holds more
 * than the last hour's.
 *
 * @param db - The database.
 * @param translationId - The translation being written.
 * @param value - What the editor holds, already validated.
 * @param actorUserId - Who asked.
 * @param now - The current time, which a test can fix.
 * @throws `not_found` when there is no such translation.
 */
export async function createPreview(
  db: Database,
  translationId: string,
  value: PreviewEntryBody,
  actorUserId: string,
  now = Date.now(),
  actorTokenId?: string,
): Promise<EntryPreview> {
  const expiresAt = new Date(now + PREVIEW_LIFETIME_MS);
  const previewId = await db.transaction(async (tx) => {
    const [translation] = await tx
      .select({ id: entryTranslations.id })
      .from(entryTranslations)
      .where(eq(entryTranslations.id, translationId))
      .limit(1);
    if (!translation) throw new HttpError(ErrorCode.NotFound, "There is no entry with this id.");

    await tx.delete(entryPreviews).where(lt(entryPreviews.expiresAt, new Date(now)));
    const [row] = await tx
      .insert(entryPreviews)
      .values({ translationId, ...value, createdBy: actorUserId, expiresAt })
      .returning({ id: entryPreviews.id });
    if (!row) throw new Error("The preview was not written.");
    await tx.insert(auditLog).values({
      ...auditActor(actorUserId, actorTokenId),
      action: "entry.previewed",
      subjectType: "entry_translations",
      subjectId: translationId,
    });
    return row.id;
  });

  const token = issuePreviewToken(previewId, expiresAt.getTime());
  return { url: new URL(`/preview/${token}/`, config.SITE_ORIGIN).href, expiresAt: expiresAt.toISOString() };
}

/**
 * The preview a token names, in the shape of the site's snapshot, holding the
 * one entry and the files and topics it names.
 *
 * The entry is the translation as it is stored, with the editor's title,
 * summary, text and reading width laid over it. Its visibility is `hidden`,
 * which is the state that renders at its address and appears in no listing,
 * whatever the translation's own state is.
 *
 * @param db - The database.
 * @param token - The token from the link.
 * @param now - The current time, which a test can fix.
 * @throws `not_found` for a token that is forged, of another kind, expired, or
 *   names a preview that is gone. One answer for all of them.
 */
export async function readPreview(db: Database, token: string, now = Date.now()): Promise<PublicSnapshot> {
  const gone = () => new HttpError(ErrorCode.NotFound, "There is no preview at this address.");
  const previewId = readPreviewToken(token, now);
  if (!previewId) throw gone();

  const [stored] = await db
    .select({
      translationId: entryTranslations.id,
      entryId: entries.id,
      language: entryTranslations.language,
      kind: entries.kind,
      featured: entries.featured,
      onHomePage: entries.onHomePage,
      createdAt: entries.createdAt,
      publishedAt: entryTranslations.publishedAt,
      modifiedAt: entries.modifiedAt,
      featuredMediaId: entryTranslations.featuredMediaId,
      socialCardMediaId: entryTranslations.socialCardMediaId,
      specs: entryTranslations.specs,
      title: entryPreviews.title,
      summary: entryPreviews.summary,
      body: entryPreviews.body,
      readingWidth: entryPreviews.readingWidth,
      expiresAt: entryPreviews.expiresAt,
    })
    .from(entryPreviews)
    .innerJoin(entryTranslations, eq(entryTranslations.id, entryPreviews.translationId))
    .innerJoin(entries, eq(entries.id, entryTranslations.entryId))
    .where(eq(entryPreviews.id, previewId))
    .limit(1);
  if (!stored || stored.expiresAt.getTime() <= now) throw gone();
  // References to named values are replaced as the snapshot replaces them, so
  // the preview shows the page a reader will see.
  const values = await readValueMap(db);
  const row = { ...stored, body: resolveValues(stored.body, values) };

  const [current] = await db
    .select({ path: paths.path })
    .from(paths)
    .where(and(eq(paths.translationId, row.translationId), eq(paths.isCurrent, true)))
    .limit(1);
  const path = current?.path ?? languagePath(row.language, "preview");

  const assigned = await db
    .select({ topicId: entryTopics.topicId })
    .from(entryTopics)
    .where(eq(entryTopics.entryId, row.entryId));
  const assignedTopics = await publicTopics(
    db,
    assigned.map((topic) => topic.topicId),
  );

  const { media, slugById } = await publicMedia(db, [row]);
  const targets = await db
    .select({ entryId: entryTranslations.entryId, language: entryTranslations.language, path: paths.path })
    .from(paths)
    .innerJoin(entryTranslations, eq(entryTranslations.id, paths.translationId))
    .where(
      and(
        eq(paths.isCurrent, true),
        eq(entryTranslations.state, "public"),
        isNull(entryTranslations.trashedAt),
      ),
    );
  const allTopics = await publicTopics(db);
  const main = await readPublicNavigation(db, targets, allTopics, "main");

  return {
    footerNavigation: await readPublicNavigation(db, targets, allTopics, "footer"),
    mainNavigation: mainNavigationFromGroups(main),
    siteFrame: await readPublicSiteFrame(db),
    entries: [
      publicEntry(
        { ...row, showInOtherLanguage: false },
        { path, visibility: "hidden", topics: assigned.map((topic) => topic.topicId), translationPath: null },
        slugById,
      ),
    ],
    topics: assignedTopics,
    forms: await publicForms(db, [row.body]),
    media,
    redirects: [],
    gone: [],
    listings: resolveListingIntroductions(await readListingSettings(db), values),
    homeBlocks: [],
  };
}
