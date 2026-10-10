import { SEARCH_HIT_LIMIT, type SearchResults } from "@layered/schemas";
import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { mediaContentUrl } from "../account/repository.js";
import type { Database } from "../db/connect.js";
import { containing } from "../db/like.js";
import {
  entries,
  entryTopics,
  entryTranslations,
  media,
  mediaTranslations,
  topicTranslations,
} from "../db/schema/index.js";
import { isRasterImage } from "../media/pictures.js";

/**
 * Everything in the dashboard that matches what the reader typed.
 *
 * Entries match by their title or by the name of one of their topics in any
 * language, and come newest first. Files match by their slug or by an alt text
 * in any language, and come alphabetically. Each part stops at
 * `SEARCH_HIT_LIMIT`, because a search is for finding one thing, not for
 * reading the whole library.
 *
 * @param db - The database.
 * @param text - What the reader typed, already trimmed and bounded by the schema.
 */
export async function searchEverything(db: Database, text: string): Promise<SearchResults> {
  const pattern = containing(text);

  const topicMatches = sql`exists (
    select 1 from ${entryTopics} as "assigned"
    join ${topicTranslations} as "named" on "named"."topic_id" = "assigned"."topic_id"
    where "assigned"."entry_id" = ${entries.id} and "named"."name" ilike ${pattern}
  )`;
  const entryRows = await db
    .select({
      id: entryTranslations.id,
      kind: entries.kind,
      title: entryTranslations.title,
      language: entryTranslations.language,
      state: entryTranslations.state,
    })
    .from(entryTranslations)
    .innerJoin(entries, eq(entries.id, entryTranslations.entryId))
    .where(
      and(isNull(entryTranslations.trashedAt), or(ilike(entryTranslations.title, pattern), topicMatches)),
    )
    .orderBy(
      desc(sql`coalesce(${entryTranslations.publishedAt}, ${entries.createdAt})`),
      desc(entryTranslations.id),
    )
    .limit(SEARCH_HIT_LIMIT);

  const altMatches = sql`exists (
    select 1 from ${mediaTranslations} as "described"
    where "described"."media_id" = ${media.id} and "described"."alt_text" ilike ${pattern}
  )`;
  // The alt text that matched where one did, so the reader sees why the file
  // is in the results, and otherwise the first one written. The outer column is
  // written out with its table, because in the field list of a query on one
  // table Drizzle renders it as a bare "id", which inside this subquery would
  // mean the subquery's own row.
  const altText = sql<string | null>`(
    select "shown"."alt_text" from ${mediaTranslations} as "shown"
    where "shown"."media_id" = "media"."id" and "shown"."alt_text" is not null
    order by ("shown"."alt_text" ilike ${pattern}) desc, "shown"."language"
    limit 1
  )`;
  const mediaRows = await db
    .select({ id: media.id, slug: media.slug, kind: media.kind, mimeType: media.mimeType, altText })
    .from(media)
    .where(or(ilike(media.slug, pattern), altMatches))
    .orderBy(asc(media.slug))
    .limit(SEARCH_HIT_LIMIT);

  return {
    entries: entryRows,
    media: mediaRows.map((row) => ({
      id: row.id,
      slug: row.slug,
      thumbnailUrl: isRasterImage(row) ? mediaContentUrl(row.id) : null,
      altText: row.altText,
    })),
  };
}
