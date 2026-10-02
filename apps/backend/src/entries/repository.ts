import type { EntryKind, EntryList } from "@layered/schemas";
import { and, desc, eq, inArray, type SQLWrapper, sql } from "drizzle-orm";
import { mediaContentUrl, RASTER_MIME_TYPES } from "../account/repository.js";
import type { database } from "../db/connect.js";
import { entries, entryTopics, entryTranslations, media, topicTranslations } from "../db/schema/index.js";

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
    select coalesce(
      (select "own"."name" from ${topicTranslations} as "own"
        where "own"."topic_id" = "assigned"."topic_id" and "own"."language" = ${language}),
      (select "other"."name" from ${topicTranslations} as "other"
        where "other"."topic_id" = "assigned"."topic_id" order by "other"."language" limit 1)
    ) as "name"
    from ${entryTopics} as "assigned"
    where "assigned"."entry_id" = ${entryId}
    order by 1
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
