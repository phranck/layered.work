import { mediaReferences } from "@layered/content";
import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  entries,
  entryTopics,
  entryTranslations,
  formerTopicSlugs,
  gonePaths,
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
  /** Addresses of translations in the bin or deleted for good, which answer 410. */
  gone: string[];
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
  /** Listed in the other language as well whilst that language has no version a reader can open. */
  showInOtherLanguage: boolean;
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
 * The files that published content names, by id.
 *
 * Only these leave the database. The library also holds what nobody has
 * published yet, such as a portrait uploaded for an account or a picture meant
 * for a draft, and the site has no use for those: it reaches a file only through
 * an entry. Publishing them would also tell anybody reading the snapshot what is
 * in the library before it appears anywhere.
 *
 * A translation names a file in three ways, and all three count: as its
 * picture, through a component, which `mediaReferences` reads the way the
 * validator does, and through a link to the file's own path, which is how the
 * old site linked a page to a document.
 *
 * @param translations - The translations the snapshot carries.
 * @param assets - Every file in the library, with its storage key.
 */
function namedFiles(
  translations: readonly { body: string; featuredMediaId: string | null }[],
  assets: readonly { id: string; slug: string; storageKey: string }[],
): Set<string> {
  const idBySlug = new Map(assets.map((asset) => [asset.slug, asset.id]));
  const named = new Set<string>();
  for (const translation of translations) {
    if (translation.featuredMediaId) named.add(translation.featuredMediaId);
    for (const reference of mediaReferences(translation.body)) {
      const id = idBySlug.get(reference.slug);
      if (id) named.add(id);
    }
    for (const asset of assets) {
      if (translation.body.includes(`/${asset.storageKey}`)) named.add(asset.id);
    }
  }
  return named;
}

/**
 * The files some translations name, in the shape the site parses, and every
 * file's slug by id for the pictures that stand for a translation.
 *
 * Shared by the snapshot and the preview, so a preview names its pictures
 * exactly as the published page will.
 *
 * @param database - The database to read from.
 * @param translations - What is being shown: its bodies and its pictures.
 */
export async function publicMedia(
  database: Database,
  translations: readonly { body: string; featuredMediaId: string | null }[],
): Promise<{ media: PublicMedia[]; slugById: Map<string, string> }> {
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

  const named = namedFiles(translations, assets);
  return {
    slugById: new Map(assets.map((asset) => [asset.id, asset.slug])),
    media: assets
      .filter((asset) => named.has(asset.id))
      .map((asset) => ({
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
  };
}

/**
 * The redirects a renamed or merged topic leaves behind.
 *
 * The site addresses a topic by its English slug in both languages, under
 * `/topics/` and `/de/topics/`, so only an English former slug is an address
 * anybody can hold. Each one leads to where its topic answers now, in both
 * languages. A topic with no English slug has no address to lead to.
 *
 * @param database - The database to read from.
 * @param current - Every topic's current English slug.
 */
async function formerTopicAddresses(
  database: Database,
  current: readonly { id: string; slug: string }[],
): Promise<{ source: string; target: string }[]> {
  const slugById = new Map(current.map((topic) => [topic.id, topic.slug]));
  const rows = await database
    .select({ topicId: formerTopicSlugs.topicId, slug: formerTopicSlugs.slug })
    .from(formerTopicSlugs)
    .where(eq(formerTopicSlugs.language, "en"));
  return rows.flatMap((row) => {
    const target = slugById.get(row.topicId);
    if (!target || target === row.slug) return [];
    return [
      { source: `/topics/${row.slug}/`, target: `/topics/${target}/` },
      { source: `/de/topics/${row.slug}/`, target: `/de/topics/${target}/` },
    ];
  });
}

/**
 * The addresses that answer 410: every address, current or former, of a
 * translation in the bin, and every address of one deleted for good.
 *
 * An address something reachable answers at or redirects from is left out,
 * because it was given to something new and is that thing's now.
 *
 * @param database - The database to read from.
 * @param taken - The addresses the snapshot already answers at or redirects from.
 */
async function goneAddresses(database: Database, taken: ReadonlySet<string>): Promise<string[]> {
  const binned = await database
    .select({ path: paths.path })
    .from(paths)
    .innerJoin(entryTranslations, eq(entryTranslations.id, paths.translationId))
    .where(isNotNull(entryTranslations.trashedAt));
  const deleted = await database.select({ path: gonePaths.path }).from(gonePaths);
  return [...new Set([...binned, ...deleted].map((row) => row.path))]
    .filter((path) => !taken.has(path))
    .sort();
}

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
      showInOtherLanguage: entryTranslations.showInOtherLanguage,
      publishedAt: entryTranslations.publishedAt,
      featuredMediaId: entryTranslations.featuredMediaId,
      kind: entries.kind,
      featured: entries.featured,
      onHomePage: entries.onHomePage,
      modifiedAt: entries.modifiedAt,
    })
    .from(entryTranslations)
    .innerJoin(entries, eq(entries.id, entryTranslations.entryId))
    .where(and(inArray(entryTranslations.state, [...READABLE]), isNull(entryTranslations.trashedAt)));

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

  const { media: publishedMedia, slugById } = await publicMedia(database, reachable);

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
      showInOtherLanguage: row.showInOtherLanguage,
    };
  });

  const publicTopics = await database
    .select({ id: topics.id, slug: topicTranslations.slug, name: topicTranslations.name })
    .from(topicTranslations)
    .innerJoin(topics, eq(topics.id, topicTranslations.topicId))
    .where(eq(topicTranslations.language, "en"));
  former.push(...(await formerTopicAddresses(database, publicTopics)));

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
    media: publishedMedia,
    redirects: former,
    gone: await goneAddresses(
      database,
      new Set([...currentPaths.values(), ...former.map((item) => item.source)]),
    ),
    homeBlocks: blocks.map((block) => ({
      type: block.type,
      enabled: block.enabled,
      sortOrder: block.sortOrder,
      settings: (block.settings ?? {}) as Record<string, unknown>,
    })),
  };
}
