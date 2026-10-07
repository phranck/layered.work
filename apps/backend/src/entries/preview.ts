import { createHmac, hkdfSync } from "node:crypto";
import { resolveValues } from "@layered/content";
import { type EntryPreview, ErrorCode, type PreviewEntryBody } from "@layered/schemas";
import { and, eq, isNull, lt } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";
import { auditActor } from "../auth/audit-actor.js";
import { sameSignature } from "../auth/signature.js";
import { config, sessionSecret } from "../config.js";
import { type PublicSnapshot, publicForms, publicMedia, publicTopics } from "../content/snapshot.js";
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

type Database = PostgresJsDatabase<Record<string, unknown>>;

/** What a preview token is for, written into it and checked on the way back. */
const PURPOSE = "entry-preview";

/** How long a preview link works. Long enough to read, short enough to forget. */
export const PREVIEW_LIFETIME_MS = 60 * 60 * 1000;

/** The signing key, derived from the session secret for this purpose only. */
const KEY = Buffer.from(hkdfSync("sha256", sessionSecret, "", `layered:${PURPOSE}`, 32));

/** What a preview token says. */
const claimsSchema = z.strictObject({
  purpose: z.literal(PURPOSE),
  previewId: z.uuid(),
  expiresAt: z.number().int(),
});

function sign(payload: string): string {
  return createHmac("sha256", KEY).update(payload).digest("base64url");
}

/**
 * Issues the token for one preview.
 *
 * @param previewId - The row it names.
 * @param expiresAt - When it stops working, in milliseconds since the epoch.
 */
export function issuePreviewToken(previewId: string, expiresAt: number): string {
  const payload = Buffer.from(JSON.stringify({ purpose: PURPOSE, previewId, expiresAt })).toString(
    "base64url",
  );
  return `${payload}.${sign(payload)}`;
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
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  if (!sameSignature(signature, sign(payload))) return null;

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const parsed = claimsSchema.safeParse(decoded);
  if (!parsed.success || parsed.data.expiresAt <= now) return null;
  return parsed.data.previewId;
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
  const path = current?.path ?? `/${row.language === "de" ? "de/" : ""}preview/`;

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
      {
        id: row.translationId,
        title: row.title,
        slug: path.split("/").filter(Boolean).at(-1) ?? "preview",
        path,
        language: row.language,
        visibility: "hidden",
        kind: row.kind,
        createdAt: row.createdAt.toISOString(),
        publishedAt: row.publishedAt?.toISOString() ?? null,
        updatedAt: row.modifiedAt.toISOString(),
        summary: row.summary,
        body: row.body,
        topics: assigned.map((topic) => topic.topicId),
        featuredImage: row.featuredMediaId ? (slugById.get(row.featuredMediaId) ?? null) : null,
        translationPath: null,
        featured: row.featured,
        onHomePage: row.onHomePage,
        readingWidth: row.readingWidth,
        showInOtherLanguage: false,
        specs: row.specs,
      },
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
