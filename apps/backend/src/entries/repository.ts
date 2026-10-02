import type { EntryKind, EntryList } from "@layered/schemas";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { mediaContentUrl, RASTER_MIME_TYPES } from "../account/repository.js";
import type { database } from "../db/connect.js";
import { entries, entryTranslations, media } from "../db/schema/index.js";

type Database = ReturnType<typeof database>;

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
  }));
}
