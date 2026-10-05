import { mediaReferences as authoredMedia, type RenderNode, renderContent } from "@layered/content";
import { ErrorCode, listingSettings } from "@layered/schemas";
import { asc, eq, inArray } from "drizzle-orm";
import type { database } from "../db/connect.js";
import {
  entryTranslations,
  media,
  mediaReferences,
  settingMediaReferences,
  settings,
} from "../db/schema/index.js";
import { HttpError } from "../http/response.js";

type Database = ReturnType<typeof database>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Asset = { id: string; slug: string; storageKey: string };

/** Resolve declared slug parameters and rendered Markdown links/images, never prose or code. */
export function referencedMediaIds(body: string, assets: readonly Asset[]): string[] {
  const slugs = new Map(assets.map((asset) => [asset.slug, asset.id]));
  const keys = new Map<string, string>();
  for (const asset of assets) {
    keys.set(`/${asset.storageKey}`, asset.id);
    if (asset.storageKey.startsWith("migration/"))
      keys.set(`/media/${asset.storageKey.slice("migration/".length)}`, asset.id);
  }
  const found = new Set(
    authoredMedia(body).flatMap(({ slug }) => {
      const id = slugs.get(slug);
      return id ? [id] : [];
    }),
  );
  function walk(nodes: readonly RenderNode[]) {
    for (const node of nodes) {
      if (node.kind === "component" && typeof node.props.href === "string") {
        const id = keys.get(node.props.href.split(/[?#]/, 1)[0] ?? "");
        if (id) found.add(id);
      }
      if (node.kind === "element") {
        const target =
          node.tag === "a" ? node.attributes.href : node.tag === "img" ? node.attributes.src : undefined;
        if (target) {
          const id = keys.get(target.split(/[?#]/, 1)[0] ?? "");
          if (id) found.add(id);
        }
      }
      if ("children" in node) walk(node.children);
    }
  }
  walk(renderContent(body));
  return [...found].sort();
}

/** Caller locks the translation first; referenced media are pinned until this save commits. */
async function pinReferencedMedia(tx: Transaction, body: string) {
  const assets = await tx
    .select({ id: media.id, slug: media.slug, storageKey: media.storageKey })
    .from(media);
  const ids = referencedMediaIds(body, assets);
  if (ids.length) {
    const pinned = await tx
      .select({ id: media.id })
      .from(media)
      .where(inArray(media.id, ids))
      .orderBy(asc(media.id))
      .for("key share");
    if (pinned.length !== ids.length)
      throw new HttpError(
        ErrorCode.Conflict,
        "A referenced file was removed while this content was being saved.",
      );
  }
  return ids;
}
export async function replaceMediaReferences(tx: Transaction, id: string, body: string) {
  const ids = await pinReferencedMedia(tx, body);
  await tx.delete(mediaReferences).where(eq(mediaReferences.translationId, id));
  if (ids.length)
    await tx.insert(mediaReferences).values(ids.map((mediaId) => ({ translationId: id, mediaId })));
}

export async function replaceSettingMediaReferences(
  tx: Transaction,
  key: string,
  introduction: { en: string; de: string },
) {
  const references = [];
  for (const language of ["en", "de"] as const) {
    for (const mediaId of await pinReferencedMedia(tx, introduction[language]))
      references.push({ settingsKey: key, language, mediaId });
  }
  await tx.delete(settingMediaReferences).where(eq(settingMediaReferences.settingsKey, key));
  if (references.length) await tx.insert(settingMediaReferences).values(references);
}

/** Bring imported and older bodies into the index before serving the new library. */
export async function rebuildMediaReferenceIndex(db: Database) {
  await db.transaction(async (tx) => {
    const translations = await tx
      .select({ id: entryTranslations.id, body: entryTranslations.body })
      .from(entryTranslations)
      .orderBy(asc(entryTranslations.id))
      .for("update");
    for (const translation of translations)
      await replaceMediaReferences(tx, translation.id, translation.body);
    const listings = await tx
      .select()
      .from(settings)
      .where(inArray(settings.key, ["postListing", "projectListing"]))
      .orderBy(asc(settings.key))
      .for("update");
    for (const listing of listings) {
      const parsed = listingSettings.safeParse(listing.value);
      if (parsed.success) await replaceSettingMediaReferences(tx, listing.key, parsed.data.introduction);
    }
  });
}
