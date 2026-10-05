import { type PublicSearchQuery, type PublicSearchResults, publicSearchResults } from "@layered/schemas";
import { sql } from "drizzle-orm";
import type { database } from "../db/connect.js";

/** PostgreSQL stemming and ranking over reachable public translations only. */
export async function searchPublicEntries(
  db: ReturnType<typeof database>,
  { q, language, page, limit }: PublicSearchQuery,
): Promise<PublicSearchResults> {
  const result = await db.execute(sql`
    with documents as (
      select p.path, t.title, e.kind, t.language, t.published_at,
        setweight(to_tsvector(cfg.name, t.title), 'A') ||
        setweight(to_tsvector(cfg.name, coalesce(t.summary, '')), 'B') ||
        setweight(to_tsvector(cfg.name, coalesce((
          select string_agg(coalesce(local.name, en.name, de.name), ' ')
          from entry_topics assigned
          left join topic_translations local on local.topic_id = assigned.topic_id and local.language = ${language}
          left join topic_translations en on en.topic_id = assigned.topic_id and en.language = 'en'
          left join topic_translations de on de.topic_id = assigned.topic_id and de.language = 'de'
          where assigned.entry_id = e.id
        ), '')), 'B') ||
        setweight(to_tsvector(cfg.name, t.body), 'D') as document,
        websearch_to_tsquery(cfg.name, ${q}) as query
      from entry_translations t
      join entries e on e.id = t.entry_id
      join paths p on p.translation_id = t.id and p.is_current
      cross join lateral (select case when t.language = 'de' then 'german'::regconfig else 'english'::regconfig end as name) cfg
      where t.state = 'public' and t.trashed_at is null
        and (t.language = ${language} or (t.show_in_other_language and not exists (
          select 1 from entry_translations counterpart
          join paths address on address.translation_id = counterpart.id and address.is_current
          where counterpart.entry_id = t.entry_id and counterpart.language = ${language}
            and counterpart.state in ('public', 'hidden') and counterpart.trashed_at is null
        )))
    ), matches as (
      select *, ts_rank(document, query) as rank from documents where document @@ query
    )
    select coalesce(jsonb_agg(hits), '[]'::jsonb) as entries,
      (select count(*)::int from matches) as total
    from (
      select path, title, kind, language from matches
      order by rank desc, published_at desc nulls last, path
      limit ${limit} offset ${(page - 1) * limit}
    ) hits
  `);
  return publicSearchResults.parse(result[0]);
}
