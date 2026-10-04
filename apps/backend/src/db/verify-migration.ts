import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { LISTED_KINDS, LISTING_GROUP, type ListedKind, listingSettings } from "@layered/schemas";
import { and, eq, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { isPubliiSizeCopy, listingAt } from "./import-content.js";
import {
  entries,
  entryTopics,
  entryTranslations,
  media,
  paths,
  settings,
  topicTranslations,
} from "./schema/index.js";

/**
 * Proof that the migration lost nothing between the Publii database and this
 * one, as figures rather than as a look at a few pages.
 *
 * Both sides are read in full and compared, so the result says what differs
 * rather than what was expected to. The Publii database is opened read-only,
 * and this database is only read.
 *
 * What it does not cover is the text a reader sees. That needs the site
 * rendered, which `apps/website/tools/verify-migration.mjs` does against the
 * snapshot this side writes out.
 */

/** A publication state as both systems can express it. */
export type State = "public" | "hidden" | "draft" | "trashed";

/** One Publii post, reduced to what the comparison needs. */
export interface SourcePost {
  slug: string;
  title: string;
  state: State;
  createdAt: string;
  topics: string[];
  /** A former page now represented by a listing introduction, not an entry. */
  overview?: ListedKind;
}

/** One file in Publii's media directory. */
export interface SourceFile {
  path: string;
  sha256: string;
  /** Whether a post that is not in the trash names the file. */
  named: boolean;
  /**
   * Whether it is a size copy Publii made, which the import leaves out on
   * purpose. Publii's bodies name those in their `srcset`, so `named` is true
   * of most of them and says nothing about whether a picture went missing.
   */
  copy: boolean;
}

/** Everything read out of Publii. */
export interface Source {
  posts: SourcePost[];
  topics: string[];
  files: SourceFile[];
}

/** One translation as this database holds it. */
export interface TargetTranslation {
  entryId: string;
  slug: string;
  path: string;
  title: string;
  state: Exclude<State, "trashed">;
  publishedAt: string | null;
}

/** Everything read out of this database. */
export interface Target {
  translations: TargetTranslation[];
  topics: string[];
  topicsByEntry: Map<string, string[]>;
  checksums: Set<string>;
  introductions: Map<ListedKind, string>;
}

/** One line of the counts table. */
export interface CountRow {
  what: string;
  source: number;
  target: number;
  matches: boolean;
  note: string;
}

/** One line of the per-entry table. */
export interface EntryRow {
  slug: string;
  path: string | null;
  state: State;
  title: boolean;
  date: boolean;
  topics: boolean;
  problems: string[];
}

/** One former Publii page represented by a listing introduction. */
export interface OverviewRow {
  slug: string;
  path: string;
  introduction: boolean;
  problems: string[];
}

/** The whole comparison. */
export interface Verification {
  counts: CountRow[];
  entries: EntryRow[];
  overviews: OverviewRow[];
  /** Files absent from this database, each with whether any post names it. */
  absentFiles: SourceFile[];
  passed: boolean;
}

/**
 * The state a Publii status string describes.
 *
 * Publii writes its flags into one comma-separated column. The trash wins over
 * everything, a draft over visibility, and a post that is neither published nor
 * a draft is treated as a draft, the same reading the migration applied.
 */
export function stateOf(status: string): State {
  const flags = new Set(status.split(","));
  if (flags.has("trashed")) return "trashed";
  if (flags.has("draft")) return "draft";
  if (flags.has("hidden")) return "hidden";
  if (flags.has("published")) return "public";
  return "draft";
}

/** The listing a Publii page became, if its slug owns a listing address. */
export function overviewForPubliiPost(slug: string, status: string): ListedKind | undefined {
  if (!status.split(",").includes("is-page")) return undefined;
  return listingAt({ kind: "page", language: "en", path: `/${slug}/` });
}

/** A Publii timestamp, which is milliseconds since the epoch, as an ISO string. */
function instantOf(milliseconds: number): string {
  return new Date(milliseconds).toISOString();
}

/**
 * Every file below a directory, as paths relative to it.
 *
 * Disk images are left out, because the migration links the two ISO files to
 * the Internet Archive rather than carrying them.
 */
function filesBelow(root: string, directory = root): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((item) => {
    const path = join(directory, item.name);
    if (item.isDirectory()) return filesBelow(root, path);
    if (item.name.startsWith(".") || item.name.toLowerCase().endsWith(".iso")) return [];
    return [relative(root, path).split(sep).join("/")];
  });
}

/**
 * Reads the Publii site: its posts, its topics and its media files.
 *
 * @param input - The site's `input` directory, holding `db.sqlite` and `media/`.
 */
export function readSource(input: string): Source {
  const database = new DatabaseSync(join(input, "db.sqlite"), { readOnly: true });
  try {
    const rows = database
      .prepare("select id, slug, title, status, created_at, text from posts order by id")
      .all() as {
      id: number;
      slug: string;
      title: string;
      status: string;
      created_at: number;
      text: string;
    }[];
    const assignments = database
      .prepare("select pt.post_id as post, t.slug as slug from posts_tags pt join tags t on t.id = pt.tag_id")
      .all() as { post: number; slug: string }[];
    const topics = (database.prepare("select slug from tags").all() as { slug: string }[]).map(
      (row) => row.slug,
    );
    const images = database.prepare("select post_id as post, url from posts_images").all() as {
      post: number;
      url: string;
    }[];
    const extra = database.prepare("select post_id as post, value from posts_additional_data").all() as {
      post: number;
      value: string;
    }[];

    const posts = rows.map((row) => ({
      slug: row.slug,
      title: row.title,
      state: stateOf(row.status),
      createdAt: instantOf(row.created_at),
      topics: assignments.filter((item) => item.post === row.id).map((item) => item.slug),
      overview: overviewForPubliiPost(row.slug, row.status),
    }));

    // Everything a live post could name a file in: its body, its images and
    // its additional data. A file whose name appears in none of them is one no
    // page ever showed.
    const live = new Set(rows.filter((row) => stateOf(row.status) !== "trashed").map((row) => row.id));
    const named = [
      ...rows.filter((row) => live.has(row.id)).map((row) => row.text ?? ""),
      ...images.filter((row) => live.has(row.post)).map((row) => row.url ?? ""),
      ...extra.filter((row) => live.has(row.post)).map((row) => row.value ?? ""),
    ].join("\n");

    const mediaRoot = join(input, "media");
    const files = filesBelow(mediaRoot).map((path) => ({
      path,
      sha256: createHash("sha256")
        .update(readFileSync(join(mediaRoot, path)))
        .digest("hex"),
      named: named.includes(path.split("/").at(-1) ?? path),
      copy: isPubliiSizeCopy(path),
    }));

    return { posts, topics, files };
  } finally {
    database.close();
  }
}

type Database = PostgresJsDatabase<Record<string, unknown>>;

/**
 * Reads what this database holds, in every state.
 *
 * Unlike the site's snapshot this includes drafts, because a draft that did not
 * arrive is as much a loss as a public entry that did not.
 */
export async function readTarget(database: Database): Promise<Target> {
  const rows = await database
    .select({
      entryId: entries.id,
      path: paths.path,
      title: entryTranslations.title,
      state: entryTranslations.state,
      publishedAt: entryTranslations.publishedAt,
    })
    .from(entryTranslations)
    .innerJoin(entries, eq(entries.id, entryTranslations.entryId))
    .innerJoin(paths, and(eq(paths.translationId, entryTranslations.id), eq(paths.isCurrent, true)));

  const assignments = await database
    .select({ entryId: entryTopics.entryId, slug: topicTranslations.slug })
    .from(entryTopics)
    .innerJoin(
      topicTranslations,
      and(eq(topicTranslations.topicId, entryTopics.topicId), eq(topicTranslations.language, "en")),
    );
  const topicsByEntry = new Map<string, string[]>();
  for (const row of assignments) {
    topicsByEntry.set(row.entryId, [...(topicsByEntry.get(row.entryId) ?? []), row.slug]);
  }

  const topics = await database
    .select({ slug: topicTranslations.slug })
    .from(topicTranslations)
    .where(eq(topicTranslations.language, "en"));
  const checksums = await database.select({ checksum: media.checksum }).from(media);
  const listingRows = await database
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(
      inArray(
        settings.key,
        LISTED_KINDS.map((kind) => LISTING_GROUP[kind]),
      ),
    );
  const listingValues = new Map(listingRows.map((row) => [row.key, row.value]));
  const introductions = new Map<ListedKind, string>();
  for (const kind of LISTED_KINDS) {
    const parsed = listingSettings.safeParse(listingValues.get(LISTING_GROUP[kind]));
    introductions.set(kind, parsed.success ? parsed.data.introduction.en : "");
  }

  return {
    translations: rows.map((row) => ({
      entryId: row.entryId,
      slug: row.path.split("/").filter(Boolean).at(-1) ?? "",
      path: row.path,
      title: row.title,
      state: row.state,
      publishedAt: row.publishedAt?.toISOString() ?? null,
    })),
    topics: topics.map((row) => row.slug),
    topicsByEntry,
    checksums: new Set(checksums.map((row) => row.checksum)),
    introductions,
  };
}

/** Whether two lists hold the same values, regardless of order. */
function sameSet(left: string[], right: string[]): boolean {
  const a = new Set(left);
  const b = new Set(right);
  return a.size === b.size && [...a].every((value) => b.has(value));
}

/** How many of a list carry a given state. */
function countOf<T extends { state: State }>(items: T[], state: State): number {
  return items.filter((item) => item.state === state).length;
}

/**
 * Compares the two sides.
 *
 * A post is matched to a translation by its slug, which is the last segment of
 * the address on both sides: the migration moved the German entries under
 * `/de/` and the projects under `/projects/`, and kept the slug in every case.
 *
 * Topics are compared per entry rather than per post, because a translation
 * pair is one entry here and its topics belong to the pair. The expected set is
 * therefore the union of what both posts of a pair carried in Publii.
 *
 * @param source - What Publii holds.
 * @param target - What this database holds.
 */
export function compare(source: Source, target: Target): Verification {
  const overviewPosts = source.posts.filter((post) => post.overview && post.state !== "trashed");
  const entryPosts = source.posts.filter((post) => !post.overview || post.state === "trashed");
  const bySlug = new Map(target.translations.map((row) => [row.slug, row]));

  const slugsByEntry = new Map<string, string[]>();
  for (const row of target.translations) {
    slugsByEntry.set(row.entryId, [...(slugsByEntry.get(row.entryId) ?? []), row.slug]);
  }
  const postsBySlug = new Map(source.posts.map((post) => [post.slug, post]));

  const entryRows: EntryRow[] = entryPosts.map((post) => {
    const found = bySlug.get(post.slug);
    if (post.state === "trashed") {
      return {
        slug: post.slug,
        path: found?.path ?? null,
        state: post.state,
        title: true,
        date: true,
        topics: true,
        problems: found ? ["in the trash in Publii, and present here"] : [],
      };
    }
    if (!found) {
      return {
        slug: post.slug,
        path: null,
        state: post.state,
        title: false,
        date: false,
        topics: false,
        problems: ["missing"],
      };
    }

    const expectedTopics = (slugsByEntry.get(found.entryId) ?? []).flatMap(
      (slug) => postsBySlug.get(slug)?.topics ?? [],
    );
    const title = found.title === post.title;
    const date = found.publishedAt === post.createdAt;
    const topics = sameSet(target.topicsByEntry.get(found.entryId) ?? [], expectedTopics);
    const problems = [
      ...(found.state === post.state ? [] : [`state ${found.state}, expected ${post.state}`]),
      ...(title ? [] : [`title "${found.title}", expected "${post.title}"`]),
      ...(date ? [] : [`date ${found.publishedAt}, expected ${post.createdAt}`]),
      ...(topics ? [] : ["topics differ"]),
    ];
    return { slug: post.slug, path: found.path, state: post.state, title, date, topics, problems };
  });

  const overviews: OverviewRow[] = overviewPosts.map((post) => {
    const introduction = Boolean(target.introductions.get(post.overview as ListedKind)?.trim());
    const problems = [
      ...(introduction ? [] : ["introduction missing"]),
      ...(post.topics.length === 0 ? [] : ["overview topics are not represented"]),
    ];
    return { slug: post.slug, path: `/${post.slug}/`, introduction, problems };
  });

  // Distinct contents rather than files, because Publii copied the same file
  // into several post directories and this database holds a file once.
  const distinct = new Map<string, SourceFile>();
  for (const file of source.files) {
    const seen = distinct.get(file.sha256);
    distinct.set(file.sha256, seen ? { ...seen, named: seen.named || file.named } : file);
  }
  const absentFiles = [...distinct.values()].filter((file) => !target.checksums.has(file.sha256));

  const expectedAssignments = [...slugsByEntry.values()].reduce(
    (total, slugs) => total + new Set(slugs.flatMap((slug) => postsBySlug.get(slug)?.topics ?? [])).size,
    0,
  );
  const actualAssignments = [...target.topicsByEntry.values()].reduce(
    (total, slugs) => total + slugs.length,
    0,
  );
  const absentCopies = absentFiles.filter((file) => file.copy).length;
  const absentNamed = absentFiles.filter((file) => file.named && !file.copy).length;

  const counts: CountRow[] = [
    ...(["public", "hidden", "draft"] as const).map((state) => ({
      what: `Entries, ${state}`,
      source: countOf(entryPosts, state),
      target: countOf(target.translations, state),
      matches: countOf(entryPosts, state) === countOf(target.translations, state),
      note: "",
    })),
    {
      what: "Overview introductions",
      source: overviews.length,
      target: overviews.filter((row) => row.introduction).length,
      matches: overviews.every((row) => row.problems.length === 0),
      note: "Former pages represented by listing settings",
    },
    {
      what: "Entries in the trash",
      source: countOf(source.posts, "trashed"),
      target: 0,
      matches: entryRows.every((row) => row.state !== "trashed" || row.problems.length === 0),
      note: "Not migrated, by decision",
    },
    {
      what: "Topics",
      source: source.topics.length,
      target: target.topics.length,
      matches: sameSet(source.topics, target.topics),
      note: "",
    },
    {
      what: "Topic assignments",
      source: expectedAssignments,
      target: actualAssignments,
      matches: expectedAssignments === actualAssignments,
      note: "Per entry, so a pair's shared topic counts once",
    },
    {
      what: "Media, distinct contents",
      source: distinct.size,
      target: distinct.size - absentFiles.length,
      matches: absentNamed === 0,
      note: `${source.files.length} files without the disk images; ${absentFiles.length} absent here, ${absentCopies} of them Publii's size copies, and ${absentNamed} of the rest named by a post`,
    },
  ];

  return {
    counts,
    entries: entryRows,
    overviews,
    absentFiles,
    passed:
      counts.every((row) => row.matches) &&
      entryRows.every((row) => row.problems.length === 0) &&
      overviews.every((row) => row.problems.length === 0) &&
      entryPosts.filter((post) => post.state !== "trashed").length === target.translations.length,
  };
}
