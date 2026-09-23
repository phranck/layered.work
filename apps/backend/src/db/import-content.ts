import { and, eq, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  entries,
  entryTopics,
  entryTranslations,
  media,
  mediaTranslations,
  paths,
  topics,
  topicTranslations,
} from "./schema/index.js";

/**
 * Writes a content snapshot into the database.
 *
 * The snapshot is flat and the schema is not, so this is a translation. One
 * snapshot entry becomes a row in `entries` and a row in `entry_translations`,
 * and a pair of entries pointing at each other becomes one row in `entries`
 * carrying both. Every address the old site answered becomes a row in `paths`,
 * the current one marked as such and the rest kept beside it, which is what that
 * table is for.
 *
 * Running it twice leaves the same rows. An entry is recognised by the address
 * its translation currently answers at, because that is the one value the
 * snapshot and the database both hold and neither invents.
 *
 * What it does not write: media variants. The snapshot describes them as a
 * `srcSet` string, which gives a width and a path and neither a height nor a
 * byte size, and `media_variants` requires both. They arrive when the site reads
 * its media from the database and something generates them against it.
 */

/** One entry as the snapshot holds it. */
export interface SnapshotEntry {
  id: number | string;
  title: string;
  slug: string;
  path: string;
  language: "en" | "de";
  visibility: "public" | "hidden" | "draft" | "trashed";
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
  readingWidth: "narrow" | "normal" | "wide" | "full";
}

/** One asset as the snapshot holds it. */
export interface SnapshotMedia {
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

/** The whole snapshot, as `site.json` holds it. */
export interface Snapshot {
  entries: SnapshotEntry[];
  topics: { id: number | string; slug: string; name: string }[];
  media: SnapshotMedia[];
  redirects: { source: string; target: string }[];
}

/** What the import wrote, so the caller can say it rather than guess. */
export interface ImportReport {
  media: number;
  topics: number;
  entries: number;
  translations: number;
  paths: number;
  skipped: { slug: string; reason: string }[];

  /**
   * Slugs that name a file another slug already named.
   *
   * Not an error and not something the import can settle: a body referring to
   * the second slug will not find it once the site reads its media from the
   * database, and what should happen then is a decision about content.
   */
  aliased: { slug: string; sameFileAs: string }[];
}

type Database = PostgresJsDatabase<Record<string, unknown>>;

/**
 * Which kind of asset a MIME type describes.
 *
 * `media_kind` is four values and a MIME type is hundreds, so the mapping is by
 * prefix with one exception: a `.glb` is `model/gltf-binary`, and everything
 * else that is neither image nor video is a document.
 */
function mediaKindOf(mime: string): "image" | "video" | "document" | "model" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("model/")) return "model";
  return "document";
}

/**
 * Writes the snapshot's assets, and returns their database ids by slug.
 *
 * The slug is what content refers to and what the snapshot carries, so it is the
 * key on both sides. An image without dimensions is refused by the table rather
 * than by this function, which is deliberate: the check belongs where every
 * writer meets it.
 */
async function importMedia(
  database: Database,
  snapshot: Snapshot,
  report: ImportReport,
): Promise<Map<string, string>> {
  const byslug = new Map<string, string>();
  const bychecksum = new Map<string, string>();

  for (const asset of snapshot.media) {
    const kind = mediaKindOf(asset.mime);
    if (kind === "image" && (asset.width === undefined || asset.height === undefined)) {
      report.skipped.push({ slug: asset.slug, reason: "an image with no dimensions" });
      continue;
    }

    // Publii copied the same file into several post directories, so the
    // migration gave each copy its own slug. The table holds a file once, by
    // checksum, which is the stricter and the truer of the two: what the second
    // slug names is the first file. Both slugs are answered from the one row,
    // and the alias is reported rather than written, because nothing here can
    // decide what a body referring to the second one should do.
    const seen = bychecksum.get(asset.sha256);
    if (seen) {
      byslug.set(asset.slug, seen);
      report.aliased.push({
        slug: asset.slug,
        sameFileAs: [...byslug].find(([, id]) => id === seen)?.[0] ?? "",
      });
      continue;
    }

    const [row] = await database
      .insert(media)
      .values({
        slug: asset.slug,
        kind,
        mimeType: asset.mime,
        storageKey: asset.src.replace(/^\//, ""),
        byteSize: asset.bytes,
        checksum: asset.sha256,
        width: asset.width ?? null,
        height: asset.height ?? null,
      })
      .onConflictDoUpdate({
        target: media.slug,
        set: {
          kind,
          mimeType: asset.mime,
          storageKey: asset.src.replace(/^\//, ""),
          byteSize: asset.bytes,
          width: asset.width ?? null,
          height: asset.height ?? null,
        },
      })
      .returning({ id: media.id });

    if (!row) continue;
    byslug.set(asset.slug, row.id);
    bychecksum.set(asset.sha256, row.id);
    report.media += 1;

    // The alt text the migration preserved. English, because that is the
    // language it was written in, and a row saying nothing is refused by the
    // table rather than written empty.
    if (asset.alt) {
      await database
        .insert(mediaTranslations)
        .values({ mediaId: row.id, language: "en", altText: asset.alt })
        .onConflictDoUpdate({
          target: [mediaTranslations.mediaId, mediaTranslations.language],
          set: { altText: asset.alt },
        });
    }
  }

  return byslug;
}

/**
 * Writes the snapshot's topics, and returns their database ids by slug.
 *
 * The old site had one language of topic names, so each becomes an English
 * translation. A German name for the same topic is a row somebody adds later,
 * which is what the table is shaped for.
 */
async function importTopics(
  database: Database,
  snapshot: Snapshot,
  report: ImportReport,
): Promise<Map<string, string>> {
  const byslug = new Map<string, string>();

  for (const topic of snapshot.topics) {
    const [existing] = await database
      .select({ topicId: topicTranslations.topicId })
      .from(topicTranslations)
      .where(and(eq(topicTranslations.language, "en"), eq(topicTranslations.slug, topic.slug)))
      .limit(1);

    if (existing) {
      await database
        .update(topicTranslations)
        .set({ name: topic.name })
        .where(and(eq(topicTranslations.topicId, existing.topicId), eq(topicTranslations.language, "en")));
      byslug.set(topic.slug, existing.topicId);
      report.topics += 1;
      continue;
    }

    const [created] = await database.insert(topics).values({}).returning({ id: topics.id });
    if (!created) continue;
    await database
      .insert(topicTranslations)
      .values({ topicId: created.id, language: "en", name: topic.name, slug: topic.slug });
    byslug.set(topic.slug, created.id);
    report.topics += 1;
  }

  return byslug;
}

/**
 * Groups the snapshot's entries into what each `entries` row will carry.
 *
 * `translationPath` is the only thing that says two entries are one piece of
 * writing in two languages, and it points both ways. Each pair therefore
 * appears twice whilst walking the list, so the one already claimed is skipped.
 */
function groupTranslations(snapshot: Snapshot): SnapshotEntry[][] {
  const byPath = new Map(snapshot.entries.map((entry) => [entry.path, entry]));
  const claimed = new Set<string>();
  const groups: SnapshotEntry[][] = [];

  for (const entry of snapshot.entries) {
    if (claimed.has(entry.path)) continue;
    claimed.add(entry.path);

    const counterpart = entry.translationPath ? byPath.get(entry.translationPath) : undefined;
    if (counterpart && !claimed.has(counterpart.path)) {
      claimed.add(counterpart.path);
      groups.push([entry, counterpart]);
      continue;
    }
    groups.push([entry]);
  }

  return groups;
}

/**
 * Finds the entry a translation at this address already belongs to.
 *
 * The address is the key because it is the one value the snapshot and the
 * database both hold. A second run therefore updates what it wrote the first
 * time rather than writing it again beside itself.
 */
async function entryAt(database: Database, path: string): Promise<string | undefined> {
  const [row] = await database
    .select({ entryId: entryTranslations.entryId })
    .from(paths)
    .innerJoin(entryTranslations, eq(entryTranslations.id, paths.translationId))
    .where(and(eq(paths.path, path), eq(paths.isCurrent, true)))
    .limit(1);
  return row?.entryId;
}

/**
 * Writes one piece of writing: its entry row, its translations, their addresses
 * and their topics.
 */
async function importEntry(
  database: Database,
  group: SnapshotEntry[],
  mediaBySlug: Map<string, string>,
  topicsBySlug: Map<string, string>,
  redirectsByTarget: Map<string, string[]>,
  report: ImportReport,
): Promise<void> {
  // The English one leads where there is a pair, because the site's own English
  // paths are the ones that survived the migration unchanged.
  const lead = group.find((entry) => entry.language === "en") ?? group[0];
  if (!lead) return;

  const existingId = (await Promise.all(group.map((entry) => entryAt(database, entry.path)))).find(Boolean);

  const values = {
    kind: lead.kind,
    featured: lead.featured,
    onHomePage: lead.onHomePage,
  };

  let entryId = existingId;
  if (entryId) {
    await database.update(entries).set(values).where(eq(entries.id, entryId));
  } else {
    const [created] = await database.insert(entries).values(values).returning({ id: entries.id });
    if (!created) return;
    entryId = created.id;
  }
  report.entries += 1;

  for (const entry of group) {
    const featuredMediaId = entry.featuredImage ? (mediaBySlug.get(entry.featuredImage) ?? null) : null;
    const translationValues = {
      entryId,
      language: entry.language,
      title: entry.title,
      summary: entry.summary,
      body: entry.body,
      state: entry.visibility as "public" | "draft" | "hidden",
      readingWidth: entry.readingWidth,
      publishedAt: entry.publishedAt ? new Date(entry.publishedAt) : null,
      featuredMediaId,
    };

    const [translation] = await database
      .insert(entryTranslations)
      .values(translationValues)
      .onConflictDoUpdate({
        target: [entryTranslations.entryId, entryTranslations.language],
        set: translationValues,
      })
      .returning({ id: entryTranslations.id });
    if (!translation) continue;
    report.translations += 1;

    // The address it answers at, and every address it used to answer at. The
    // former ones carry `is_current` false, which is the whole reason the table
    // holds more than one row per translation.
    const former = redirectsByTarget.get(entry.path) ?? [];
    for (const [path, isCurrent] of [
      [entry.path, true] as const,
      ...former.map((source) => [source, false] as const),
    ]) {
      await database
        .insert(paths)
        .values({ translationId: translation.id, path, isCurrent })
        .onConflictDoUpdate({ target: paths.path, set: { translationId: translation.id, isCurrent } });
      report.paths += 1;
    }
  }

  // Topics belong to the piece of writing rather than to one of its languages,
  // so both translations contribute and the set is written once.
  const wanted = [...new Set(group.flatMap((entry) => entry.topics))]
    .map((slug) => topicsBySlug.get(slug))
    .filter((id): id is string => id !== undefined);

  if (wanted.length > 0) {
    await database
      .insert(entryTopics)
      .values(wanted.map((topicId) => ({ entryId, topicId })))
      .onConflictDoNothing();
  }

  const stale = await database
    .select({ topicId: entryTopics.topicId })
    .from(entryTopics)
    .where(eq(entryTopics.entryId, entryId));
  const remove = stale.map((row) => row.topicId).filter((id) => !wanted.includes(id));
  if (remove.length > 0) {
    await database
      .delete(entryTopics)
      .where(and(eq(entryTopics.entryId, entryId), inArray(entryTopics.topicId, remove)));
  }
}

/**
 * Writes a whole snapshot.
 *
 * @param database - The database to write to, already connected.
 * @param snapshot - The parsed `site.json`.
 * @returns What was written, and what was left out and why.
 */
export async function importContent(database: Database, snapshot: Snapshot): Promise<ImportReport> {
  const report: ImportReport = {
    media: 0,
    topics: 0,
    entries: 0,
    translations: 0,
    paths: 0,
    skipped: [],
    aliased: [],
  };

  const mediaBySlug = await importMedia(database, snapshot, report);
  const topicsBySlug = await importTopics(database, snapshot, report);

  const redirectsByTarget = new Map<string, string[]>();
  for (const redirect of snapshot.redirects) {
    redirectsByTarget.set(redirect.target, [
      ...(redirectsByTarget.get(redirect.target) ?? []),
      redirect.source,
    ]);
  }

  for (const group of groupTranslations(snapshot)) {
    // A trashed entry is not a state the schema has, and it is not one anybody
    // asked for: the old site had one, it was in the bin, and it stays out.
    const live = group.filter((entry) => entry.visibility !== "trashed");
    for (const entry of group) {
      if (entry.visibility === "trashed") report.skipped.push({ slug: entry.slug, reason: "in the bin" });
    }
    if (live.length === 0) continue;

    await importEntry(database, live, mediaBySlug, topicsBySlug, redirectsByTarget, report);
  }

  return report;
}
