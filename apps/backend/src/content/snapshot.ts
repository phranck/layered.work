import { and, asc, eq, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  entries,
  entryTopics,
  entryTranslations,
  homeBlocks,
  media,
  mediaTranslations,
  paths,
  topics,
  topicTranslations,
} from "../db/schema/index.js";

/**
 * The public content of the site, read out of the database in the shape the
 * site already parses.
 *
 * The shape is the snapshot's rather than the schema's, deliberately. The site
 * has a repository that takes it, a fallback file written in it, and a set of
 * tests against it, so keeping the shape means the change is where the data
 * comes from and nowhere else.
 *
 * Nothing that is not published leaves this file. The state filter is in the
 * query rather than applied to a fuller result, because a draft that is read
 * and then dropped has still been read, and the next person to add a field is
 * one forgotten filter away from publishing it.
 */

/** What a caller receives. */
export interface PublicSnapshot {
  entries: PublicEntry[];
  topics: { id: string; slug: string; name: string }[];
  media: PublicMedia[];
  redirects: { source: string; target: string }[];
  homeBlocks: { type: string; enabled: boolean; sortOrder: number; settings: Record<string, unknown> }[];
}

/** One entry, in the shape the site's repository parses. */
export interface PublicEntry {
  id: string;
  title: string;
  slug: string;
  path: string;
  language: "en" | "de";
  visibility: "public" | "hidden";
  kind: "post" | "page" | "project";
  publishedAt: string | null;
  updatedAt: string | null;
  summary: string | null;
  body: string;
  topics: string[];
  featuredImage: string | null;
  translationPath: string | null;
  featured: boolean;
  onHomePage: boolean;
  readingWidth: string;
}

/** One asset, in the shape the site's repository parses. */
export interface PublicMedia {
  slug: string;
  src: string;
  mime: string;
  filename: string;
  source: string;
  bytes: number;
  sha256: string;
  width?: number;
  height?: number;
  alt?: string;
}

type Database = PostgresJsDatabase<Record<string, unknown>>;

/**
 * The two states a reader may reach.
 *
 * `public` appears everywhere and `hidden` answers at its own address whilst
 * staying out of every listing, which the site enforces. `draft` is neither, and
 * it is the reason this constant exists rather than a condition written out at
 * each query.
 */
const READABLE = ["public", "hidden"] as const;

/**
 * Reads the published content.
 *
 * @param database - The database to read from.
 * @returns Everything the site may show, and nothing else.
 */
export async function readPublicSnapshot(database: Database): Promise<PublicSnapshot> {
  const translations = await database
    .select({
      translationId: entryTranslations.id,
      entryId: entryTranslations.entryId,
      language: entryTranslations.language,
      title: entryTranslations.title,
      summary: entryTranslations.summary,
      body: entryTranslations.body,
      state: entryTranslations.state,
      readingWidth: entryTranslations.readingWidth,
      publishedAt: entryTranslations.publishedAt,
      featuredMediaId: entryTranslations.featuredMediaId,
      kind: entries.kind,
      featured: entries.featured,
      onHomePage: entries.onHomePage,
      modifiedAt: entries.modifiedAt,
    })
    .from(entryTranslations)
    .innerJoin(entries, eq(entries.id, entryTranslations.entryId))
    .where(inArray(entryTranslations.state, [...READABLE]));

  const translationIds = translations.map((row) => row.translationId);
  const currentPaths = new Map<string, string>();
  const former: { source: string; target: string }[] = [];

  if (translationIds.length > 0) {
    const rows = await database
      .select({ translationId: paths.translationId, path: paths.path, isCurrent: paths.isCurrent })
      .from(paths)
      .where(inArray(paths.translationId, translationIds));

    for (const row of rows) if (row.isCurrent) currentPaths.set(row.translationId, row.path);
    for (const row of rows) {
      if (row.isCurrent) continue;
      const target = currentPaths.get(row.translationId);
      if (target) former.push({ source: row.path, target });
    }
  }

  // A translation with no current address cannot be linked to, so it is not
  // something a reader can reach and it does not belong in what the site shows.
  const reachable = translations.filter((row) => currentPaths.has(row.translationId));

  const assignments =
    reachable.length > 0
      ? await database
          .select({ entryId: entryTopics.entryId, slug: topicTranslations.slug })
          .from(entryTopics)
          .innerJoin(
            topicTranslations,
            and(eq(topicTranslations.topicId, entryTopics.topicId), eq(topicTranslations.language, "en")),
          )
          .where(inArray(entryTopics.entryId, [...new Set(reachable.map((row) => row.entryId))]))
      : [];

  const topicsByEntry = new Map<string, string[]>();
  for (const row of assignments) {
    topicsByEntry.set(row.entryId, [...(topicsByEntry.get(row.entryId) ?? []), row.slug]);
  }

  const assets = await database
    .select({
      id: media.id,
      slug: media.slug,
      mimeType: media.mimeType,
      storageKey: media.storageKey,
      byteSize: media.byteSize,
      checksum: media.checksum,
      width: media.width,
      height: media.height,
      altText: mediaTranslations.altText,
    })
    .from(media)
    .leftJoin(
      mediaTranslations,
      and(eq(mediaTranslations.mediaId, media.id), eq(mediaTranslations.language, "en")),
    );

  const slugById = new Map(assets.map((asset) => [asset.id, asset.slug]));

  // Which translation each one is the counterpart of, so the site can offer the
  // other language. Both directions, because either page may be the one open.
  const byEntry = new Map<string, typeof reachable>();
  for (const row of reachable) byEntry.set(row.entryId, [...(byEntry.get(row.entryId) ?? []), row]);

  const publicEntries: PublicEntry[] = reachable.map((row) => {
    const counterpart = byEntry.get(row.entryId)?.find((other) => other.translationId !== row.translationId);
    const path = currentPaths.get(row.translationId) ?? "";
    return {
      id: row.translationId,
      title: row.title,
      slug: path.split("/").filter(Boolean).at(-1) ?? "",
      path,
      language: row.language,
      visibility: row.state as "public" | "hidden",
      kind: row.kind,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      updatedAt: row.modifiedAt?.toISOString() ?? null,
      summary: row.summary,
      body: row.body,
      topics: topicsByEntry.get(row.entryId) ?? [],
      featuredImage: row.featuredMediaId ? (slugById.get(row.featuredMediaId) ?? null) : null,
      translationPath: counterpart ? (currentPaths.get(counterpart.translationId) ?? null) : null,
      featured: row.featured,
      onHomePage: row.onHomePage,
      readingWidth: row.readingWidth,
    };
  });

  const publicTopics = await database
    .select({ id: topics.id, slug: topicTranslations.slug, name: topicTranslations.name })
    .from(topicTranslations)
    .innerJoin(topics, eq(topics.id, topicTranslations.topicId))
    .where(eq(topicTranslations.language, "en"));

  const blocks = await database
    .select({
      type: homeBlocks.type,
      enabled: homeBlocks.enabled,
      sortOrder: homeBlocks.sortOrder,
      settings: homeBlocks.settings,
    })
    .from(homeBlocks)
    .orderBy(asc(homeBlocks.sortOrder));

  return {
    entries: publicEntries,
    topics: publicTopics,
    media: assets.map((asset) => ({
      slug: asset.slug,
      src: `/${asset.storageKey}`,
      mime: asset.mimeType,
      filename: asset.storageKey.split("/").at(-1) ?? asset.slug,
      source: asset.storageKey,
      bytes: asset.byteSize,
      sha256: asset.checksum,
      ...(asset.width === null ? {} : { width: asset.width }),
      ...(asset.height === null ? {} : { height: asset.height }),
      ...(asset.altText ? { alt: asset.altText } : {}),
    })),
    redirects: former,
    homeBlocks: blocks.map((block) => ({
      type: block.type,
      enabled: block.enabled,
      sortOrder: block.sortOrder,
      settings: (block.settings ?? {}) as Record<string, unknown>,
    })),
  };
}
