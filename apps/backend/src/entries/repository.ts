import {
  type EntryDetail,
  type EntryKind,
  type EntryList,
  ErrorCode,
  type SaveEntryBody,
} from "@layered/schemas";
import { and, desc, eq, inArray, ne, type SQLWrapper, sql } from "drizzle-orm";
import { mediaContentUrl, RASTER_MIME_TYPES } from "../account/repository.js";
import type { database } from "../db/connect.js";
import {
  auditLog,
  entries,
  entryTopics,
  entryTranslations,
  media,
  paths,
  topicTranslations,
} from "../db/schema/index.js";
import { HttpError } from "../http/response.js";

type Database = ReturnType<typeof database>;

/**
 * The names of an entry's topics, alphabetically, each in the given language
 * where the topic has a name in it and otherwise in whichever it has.
 *
 * The old site named its topics in English only, so a German translation would
 * otherwise list no topics at all until somebody writes the German names.
 *
 * @param entryId - The entry, as a column of the outer query.
 * @param language - The language to prefer, as a column of the outer query.
 */
export function topicNames(entryId: SQLWrapper, language: SQLWrapper) {
  return sql<string[]>`array(
    select ${assignedTopicName(language)} as "name"
    from ${entryTopics} as "assigned"
    where "assigned"."entry_id" = ${entryId}
    order by 1
  )`;
}

/**
 * The same topics with their ids, for a screen that links or changes them.
 *
 * @param entryId - The entry, as a column of the outer query.
 * @param language - The language to prefer, as a column of the outer query.
 */
export function topicIdsAndNames(entryId: SQLWrapper, language: SQLWrapper) {
  return sql<{ id: string; name: string }[]>`coalesce((
    select json_agg(json_build_object('id', "named"."id", 'name', "named"."name") order by "named"."name")
    from (
      select "assigned"."topic_id" as "id", ${assignedTopicName(language)} as "name"
      from ${entryTopics} as "assigned"
      where "assigned"."entry_id" = ${entryId}
    ) as "named"
  ), '[]'::json)`;
}

/**
 * The name of the topic in `"assigned"`, in the given language where it has one
 * and otherwise in whichever it has. The one rule both readers above share.
 */
function assignedTopicName(language: SQLWrapper) {
  return sql`coalesce(
    (select "own"."name" from ${topicTranslations} as "own"
      where "own"."topic_id" = "assigned"."topic_id" and "own"."language" = ${language}),
    (select "other"."name" from ${topicTranslations} as "other"
      where "other"."topic_id" = "assigned"."topic_id" order by "other"."language" limit 1)
  )`;
}

/**
 * Every translation of every entry of one kind, newest first.
 *
 * One row per translation, because that is what the dashboard lists and opens.
 * The date is the publication date, or the entry's creation date for a
 * translation never published, so the list orders by when the writing appeared
 * rather than by when its row was written. The thumbnail is offered only for a
 * picture the dashboard can show, which is a raster image in the library.
 *
 * The list is not paged. It is one site's writing, and the dashboard filters it
 * in place so that its counts and its rows always describe the same set.
 *
 * @param db - The database.
 * @param kind - Posts, pages or projects.
 */
export async function listEntries(db: Database, kind: EntryKind): Promise<EntryList> {
  const date = sql<Date>`coalesce(${entryTranslations.publishedAt}, ${entries.createdAt})`;
  const rows = await db
    .select({
      id: entryTranslations.id,
      entryId: entries.id,
      title: entryTranslations.title,
      state: entryTranslations.state,
      language: entryTranslations.language,
      publishedAt: entryTranslations.publishedAt,
      createdAt: entries.createdAt,
      pictureId: media.id,
      // The other language of the same entry. The inner table is aliased, so the
      // bare table name inside the subquery still means the outer row.
      topics: topicNames(entries.id, entryTranslations.language),
      translated: sql<boolean>`exists (
        select 1 from ${entryTranslations} as "sibling"
        where "sibling"."entry_id" = ${entries.id} and "sibling"."id" <> ${entryTranslations.id}
      )`,
    })
    .from(entryTranslations)
    .innerJoin(entries, eq(entries.id, entryTranslations.entryId))
    .leftJoin(
      media,
      and(
        eq(media.id, entryTranslations.featuredMediaId),
        eq(media.kind, "image"),
        inArray(media.mimeType, RASTER_MIME_TYPES),
      ),
    )
    .where(eq(entries.kind, kind))
    .orderBy(desc(date), desc(entryTranslations.id));

  return rows.map((row) => ({
    id: row.id,
    entryId: row.entryId,
    title: row.title,
    state: row.state,
    language: row.language,
    date: (row.publishedAt ?? row.createdAt).toISOString(),
    thumbnailUrl: row.pictureId ? mediaContentUrl(row.pictureId) : null,
    translated: row.translated,
    topics: row.topics,
  }));
}

/**
 * One translation, as the editor opens it.
 *
 * Read in any state, drafts included, because the editor is where a draft is
 * written. The caller is behind a session; what a reader may see is the public
 * snapshot's business, not this function's.
 *
 * @param db - The database.
 * @param id - The translation.
 * @throws `not_found` when there is no such translation.
 */
export async function readEntry(db: Database, id: string): Promise<EntryDetail> {
  const [row] = await db
    .select({
      id: entryTranslations.id,
      entryId: entries.id,
      kind: entries.kind,
      language: entryTranslations.language,
      title: entryTranslations.title,
      summary: entryTranslations.summary,
      body: entryTranslations.body,
      state: entryTranslations.state,
      readingWidth: entryTranslations.readingWidth,
      publishedAt: entryTranslations.publishedAt,
      modifiedAt: entries.modifiedAt,
      pictureId: media.id,
    })
    .from(entryTranslations)
    .innerJoin(entries, eq(entries.id, entryTranslations.entryId))
    .leftJoin(
      media,
      and(
        eq(media.id, entryTranslations.featuredMediaId),
        eq(media.kind, "image"),
        inArray(media.mimeType, RASTER_MIME_TYPES),
      ),
    )
    .where(eq(entryTranslations.id, id))
    .limit(1);
  if (!row) throw new HttpError(ErrorCode.NotFound, "There is no entry with this id.");

  const [current] = await db
    .select({ path: paths.path })
    .from(paths)
    .where(and(eq(paths.translationId, id), eq(paths.isCurrent, true)))
    .limit(1);

  const [counterpart] = await db
    .select({
      id: entryTranslations.id,
      language: entryTranslations.language,
      title: entryTranslations.title,
    })
    .from(entryTranslations)
    .where(and(eq(entryTranslations.entryId, row.entryId), ne(entryTranslations.id, id)))
    .limit(1);

  const [named] = await db
    .select({ topics: topicIdsAndNames(entries.id, entryTranslations.language) })
    .from(entryTranslations)
    .innerJoin(entries, eq(entries.id, entryTranslations.entryId))
    .where(eq(entryTranslations.id, id));

  return {
    id: row.id,
    entryId: row.entryId,
    kind: row.kind,
    language: row.language,
    title: row.title,
    summary: row.summary,
    body: row.body,
    state: row.state,
    readingWidth: row.readingWidth,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    modifiedAt: row.modifiedAt.toISOString(),
    path: current?.path ?? null,
    pictureUrl: row.pictureId ? mediaContentUrl(row.pictureId) : null,
    topics: named?.topics ?? [],
    counterpart: counterpart ?? null,
  };
}

/**
 * Stores what the editor holds for one translation, and records the act.
 *
 * The first time a translation becomes public it gets its publication date,
 * and only then: a correction later is not a new publication. The entry's own
 * modification time moves with every save, because it is the entry that
 * changed. The audit log names which fields changed and never their values,
 * and a translation becoming public is its own line, because who published
 * what and when is the question that log exists to answer.
 *
 * @param db - The database.
 * @param id - The translation.
 * @param value - The whole of what the editor holds, already validated.
 * @param actorUserId - The account that saved it.
 * @returns The translation as it now stands.
 */
export async function saveEntry(
  db: Database,
  id: string,
  value: SaveEntryBody,
  actorUserId: string,
): Promise<EntryDetail> {
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        entryId: entryTranslations.entryId,
        title: entryTranslations.title,
        summary: entryTranslations.summary,
        body: entryTranslations.body,
        state: entryTranslations.state,
        readingWidth: entryTranslations.readingWidth,
        publishedAt: entryTranslations.publishedAt,
      })
      .from(entryTranslations)
      .where(eq(entryTranslations.id, id))
      .limit(1);
    if (!current) throw new HttpError(ErrorCode.NotFound, "There is no entry with this id.");

    const now = new Date();
    const becomesPublic = value.state === "public" && current.state !== "public";
    await tx
      .update(entryTranslations)
      .set({
        ...value,
        publishedAt: becomesPublic && !current.publishedAt ? now : current.publishedAt,
      })
      .where(eq(entryTranslations.id, id));
    await tx.update(entries).set({ modifiedAt: now }).where(eq(entries.id, current.entryId));

    const changedKeys = (Object.keys(value) as (keyof SaveEntryBody)[]).filter(
      (key) => current[key] !== value[key],
    );
    if (changedKeys.length > 0) {
      await tx.insert(auditLog).values({
        actorUserId,
        action: "entry.updated",
        subjectType: "entry_translations",
        subjectId: id,
        detail: { changedKeys },
      });
    }
    if (becomesPublic) {
      await tx.insert(auditLog).values({
        actorUserId,
        action: "entry.published",
        subjectType: "entry_translations",
        subjectId: id,
      });
    }
  });
  return readEntry(db, id);
}
