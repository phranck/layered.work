import { referencedFormNames, renderContent } from "@layered/content";
import {
  type ListedKind,
  type ListingSettings,
  type PublicFooterNavigation,
  type PublicForm,
  type PublicMainNavigation,
  type PublicSiteFrame,
  publicForm,
  RESERVED_PATHS,
} from "@layered/schemas";
import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  entries,
  entryTopics,
  entryTranslations,
  formerTopicSlugs,
  forms,
  gonePaths,
  homeBlocks,
  media,
  mediaTranslations,
  mediaVariants,
  paths,
  topics,
  topicTranslations,
} from "../db/schema/index.js";
import { referencedMediaIds } from "../media/references.js";
import { mainNavigationFromGroups, readPublicNavigation } from "../navigation/public.js";
import { readListingSettings, readPublicSiteFrame } from "../settings/repository.js";

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
  forms: PublicForm[];
  topics: PublicTopic[];
  media: PublicMedia[];
  redirects: { source: string; target: string }[];
  /** Addresses of translations in the trash or deleted for good, which answer 410. */
  gone: string[];
  /** How the overviews of posts and projects are set up. */
  listings: Record<ListedKind, ListingSettings>;
  homeBlocks: { type: string; enabled: boolean; sortOrder: number; settings: Record<string, unknown> }[];
  footerNavigation: PublicFooterNavigation;
  mainNavigation?: PublicMainNavigation;
  siteFrame: PublicSiteFrame;
}

/** One subject and the names and addresses it has in each language. */
export interface PublicTopic {
  id: string;
  translations: {
    en: { slug: string; name: string } | null;
    de: { slug: string; name: string } | null;
  };
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
  createdAt: string;
  publishedAt: string | null;
  updatedAt: string | null;
  summary: string | null;
  body: string;
  topics: string[];
  featuredImage: string | null;
  socialImage?: string | null;
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
  caption?: string;
  translations?: {
    en: { altText: string | null; caption: string | null };
    de: { altText: string | null; caption: string | null };
  };
  srcSet?: string;
  placeholder?: string;
  focalPoint?: { x: number; y: number };
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
 * for a draft, and the site has no use for those: it reaches files through
 * entries and public listing introductions. Publishing them would also tell anybody reading the snapshot what is
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
  translations: readonly {
    body: string;
    featuredMediaId: string | null;
    socialCardMediaId?: string | null;
  }[],
  assets: readonly { id: string; slug: string; storageKey: string }[],
  otherBodies: readonly string[] = [],
): Set<string> {
  const named = new Set<string>();
  for (const translation of translations) {
    if (translation.featuredMediaId) named.add(translation.featuredMediaId);
    if (translation.socialCardMediaId) named.add(translation.socialCardMediaId);
    for (const id of referencedMediaIds(translation.body, assets)) named.add(id);
  }
  for (const body of otherBodies) for (const id of referencedMediaIds(body, assets)) named.add(id);
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
  translations: readonly {
    body: string;
    featuredMediaId: string | null;
    socialCardMediaId?: string | null;
  }[],
  otherBodies: readonly string[] = [],
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
      placeholder: media.placeholder,
      focalX: media.focalX,
      focalY: media.focalY,
    })
    .from(media);

  const named = namedFiles(translations, assets, otherBodies);
  const descriptions = named.size
    ? await database
        .select()
        .from(mediaTranslations)
        .where(inArray(mediaTranslations.mediaId, [...named]))
    : [];
  const descriptionsByMedia = new Map<string, NonNullable<PublicMedia["translations"]>>();
  for (const description of descriptions) {
    const localized = descriptionsByMedia.get(description.mediaId) ?? {
      en: { altText: null, caption: null },
      de: { altText: null, caption: null },
    };
    localized[description.language] = { altText: description.altText, caption: description.caption };
    descriptionsByMedia.set(description.mediaId, localized);
  }
  const variants = named.size
    ? await database
        .select({
          mediaId: mediaVariants.mediaId,
          format: mediaVariants.format,
          width: mediaVariants.width,
          storageKey: mediaVariants.storageKey,
        })
        .from(mediaVariants)
        .where(inArray(mediaVariants.mediaId, [...named]))
    : [];
  const variantsByMedia = new Map<string, typeof variants>();
  for (const variant of variants) {
    variantsByMedia.set(variant.mediaId, [...(variantsByMedia.get(variant.mediaId) ?? []), variant]);
  }
  return {
    slugById: new Map(assets.map((asset) => [asset.id, asset.slug])),
    media: assets
      .filter((asset) => named.has(asset.id))
      .map((asset) => {
        const localized = descriptionsByMedia.get(asset.id) ?? {
          en: { altText: null, caption: null },
          de: { altText: null, caption: null },
        };
        const sizes = variantsByMedia.get(asset.id) ?? [];
        const format = sizes.some((variant) => variant.format === "webp") ? "webp" : sizes[0]?.format;
        const srcSet = sizes
          .filter((variant) => variant.format === format)
          .sort((left, right) => left.width - right.width)
          .map((variant) => `/${variant.storageKey} ${variant.width}w`)
          .join(", ");
        return {
          slug: asset.slug,
          focalPoint: { x: asset.focalX, y: asset.focalY },
          src: `/${asset.storageKey}`,
          mime: asset.mimeType,
          filename: asset.storageKey.split("/").at(-1) ?? asset.slug,
          source: asset.storageKey,
          bytes: asset.byteSize,
          sha256: asset.checksum,
          ...(asset.width === null ? {} : { width: asset.width }),
          ...(asset.height === null ? {} : { height: asset.height }),
          translations: localized,
          ...(localized.en.altText === null ? {} : { alt: localized.en.altText }),
          ...(localized.en.caption === null ? {} : { caption: localized.en.caption }),
          ...(srcSet ? { srcSet } : {}),
          ...(asset.placeholder ? { placeholder: asset.placeholder } : {}),
        };
      }),
  };
}

/** Only form declarations referenced by these reachable bodies may leave the API. */
export async function publicForms(database: Database, bodies: readonly string[]): Promise<PublicForm[]> {
  const names = new Set(bodies.flatMap((body) => referencedFormNames(renderContent(body))));
  if (names.size === 0) return [];
  const rows = await database
    .select({ declaration: forms.declaration })
    .from(forms)
    .where(inArray(forms.slug, [...names]));
  return rows.map((row) => {
    const { slug, name, successMessage, fields } = row.declaration;
    return publicForm.parse({ slug, name, successMessage, fields });
  });
}

/** The names and addresses of the topics a snapshot or preview carries. */
export async function publicTopics(database: Database, ids?: readonly string[]): Promise<PublicTopic[]> {
  if (ids && ids.length === 0) return [];
  const topicRows = await database
    .select({
      id: topics.id,
      language: topicTranslations.language,
      slug: topicTranslations.slug,
      name: topicTranslations.name,
    })
    .from(topicTranslations)
    .innerJoin(topics, eq(topics.id, topicTranslations.topicId))
    .where(ids ? inArray(topics.id, [...ids]) : undefined);
  const translationsByTopic = new Map<string, Partial<PublicTopic["translations"]>>();
  for (const row of topicRows) {
    const translations = translationsByTopic.get(row.id) ?? {};
    translations[row.language] = { slug: row.slug, name: row.name };
    translationsByTopic.set(row.id, translations);
  }
  return [...translationsByTopic].flatMap(([id, translations]) =>
    translations.en || translations.de
      ? [{ id, translations: { en: translations.en ?? null, de: translations.de ?? null } }]
      : [],
  );
}

/**
 * The redirects a renamed or merged topic leaves behind.
 *
 * Former English addresses remain valid in both languages. Former German
 * addresses remain valid only under `/de/topics/`. A topic that gained a German
 * translation also redirects its old German page at the English slug.
 *
 * @param database - The database to read from.
 * @param current - Every topic and its current addresses.
 */
async function formerTopicAddresses(
  database: Database,
  current: readonly PublicTopic[],
): Promise<{ source: string; target: string }[]> {
  const topicById = new Map(current.map((topic) => [topic.id, topic]));
  const rows = await database
    .select({
      topicId: formerTopicSlugs.topicId,
      slug: formerTopicSlugs.slug,
      language: formerTopicSlugs.language,
    })
    .from(formerTopicSlugs);
  const redirects = new Map<string, string>();
  const add = (source: string, target: string) => {
    if (source === target) return;
    const existing = redirects.get(source);
    if (existing && existing !== target) throw new Error(`Conflicting topic redirect: ${source}`);
    redirects.set(source, target);
  };
  for (const topic of current) {
    if (topic.translations.en && topic.translations.de) {
      add(`/de/topics/${topic.translations.en.slug}/`, `/de/topics/${topic.translations.de.slug}/`);
    }
  }
  for (const row of rows) {
    const topic = topicById.get(row.topicId);
    if (!topic) continue;
    const english = topic.translations.en?.slug ?? topic.translations.de?.slug;
    const german = topic.translations.de?.slug ?? topic.translations.en?.slug;
    if (!english || !german) continue;
    if (row.language === "en") {
      add(`/topics/${row.slug}/`, `/topics/${english}/`);
      add(`/de/topics/${row.slug}/`, `/de/topics/${german}/`);
    } else {
      add(`/de/topics/${row.slug}/`, `/de/topics/${german}/`);
    }
  }
  return [...redirects].map(([source, target]) => ({ source, target }));
}

/**
 * The addresses that answer 410: every address, current or former, of a
 * translation in the trash, and every address of one deleted for good.
 *
 * An address something reachable answers at or redirects from is left out,
 * because it was given to something new and is that thing's now, and so is an
 * address the site reserves for itself.
 *
 * @param database - The database to read from.
 * @param taken - The addresses the snapshot already answers at or redirects from.
 */
async function goneAddresses(database: Database, taken: ReadonlySet<string>): Promise<string[]> {
  const inTrash = await database
    .select({ path: paths.path })
    .from(paths)
    .innerJoin(entryTranslations, eq(entryTranslations.id, paths.translationId))
    .where(isNotNull(entryTranslations.trashedAt));
  const deleted = await database.select({ path: gonePaths.path }).from(gonePaths);
  return [...new Set([...inTrash, ...deleted].map((row) => row.path))]
    .filter((path) => !taken.has(path) && !RESERVED_PATHS.includes(path))
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
      socialCardMediaId: entryTranslations.socialCardMediaId,
      kind: entries.kind,
      featured: entries.featured,
      onHomePage: entries.onHomePage,
      createdAt: entries.createdAt,
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

  const publishedForms = await publicForms(
    database,
    reachable.map((row) => row.body),
  );

  const assignments =
    reachable.length > 0
      ? await database
          .select({ entryId: entryTopics.entryId, topicId: entryTopics.topicId })
          .from(entryTopics)
          .where(inArray(entryTopics.entryId, [...new Set(reachable.map((row) => row.entryId))]))
      : [];

  const topicsByEntry = new Map<string, string[]>();
  for (const row of assignments) {
    topicsByEntry.set(row.entryId, [...(topicsByEntry.get(row.entryId) ?? []), row.topicId]);
  }

  const listings = await readListingSettings(database);
  const { media: publishedMedia, slugById } = await publicMedia(
    database,
    reachable,
    Object.values(listings).flatMap((listing) => Object.values(listing.introduction)),
  );

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
      createdAt: row.createdAt.toISOString(),
      publishedAt: row.publishedAt?.toISOString() ?? null,
      updatedAt: row.modifiedAt?.toISOString() ?? null,
      summary: row.summary,
      body: row.body,
      topics: topicsByEntry.get(row.entryId) ?? [],
      featuredImage: row.featuredMediaId ? (slugById.get(row.featuredMediaId) ?? null) : null,
      socialImage: row.socialCardMediaId ? (slugById.get(row.socialCardMediaId) ?? null) : null,
      translationPath: counterpart ? (currentPaths.get(counterpart.translationId) ?? null) : null,
      featured: row.featured,
      onHomePage: row.onHomePage,
      readingWidth: row.readingWidth,
      showInOtherLanguage: row.showInOtherLanguage,
    };
  });

  const publishedTopics = await publicTopics(database);
  former.push(...(await formerTopicAddresses(database, publishedTopics)));

  const blocks = await database
    .select({
      type: homeBlocks.type,
      enabled: homeBlocks.enabled,
      sortOrder: homeBlocks.sortOrder,
      settings: homeBlocks.settings,
    })
    .from(homeBlocks)
    .orderBy(asc(homeBlocks.sortOrder));

  const targets = reachable
    .filter((row) => row.state === "public")
    .map((row) => ({
      entryId: row.entryId,
      language: row.language,
      path: currentPaths.get(row.translationId) ?? "",
    }));
  const main = await readPublicNavigation(database, targets, publishedTopics, "main");
  return {
    entries: publicEntries,
    footerNavigation: await readPublicNavigation(database, targets, publishedTopics, "footer"),
    mainNavigation: mainNavigationFromGroups(main),
    siteFrame: await readPublicSiteFrame(database),
    forms: publishedForms,
    topics: publishedTopics,
    media: publishedMedia,
    redirects: former,
    gone: await goneAddresses(
      database,
      new Set([...currentPaths.values(), ...former.map((item) => item.source)]),
    ),
    listings,
    homeBlocks: blocks.map((block) => ({
      type: block.type,
      enabled: block.enabled,
      sortOrder: block.sortOrder,
      settings: (block.settings ?? {}) as Record<string, unknown>,
    })),
  };
}
