import { type DashboardCounts, mailTemplateKind } from "@layered/schemas";
import { sql } from "drizzle-orm";
import type { Database } from "../../db/connect.js";
import {
  entries,
  entryTranslations,
  formSubmissions,
  forms,
  homeBlocks,
  media,
  namedValues,
  navigationItems,
  navigations,
  socialAccounts,
  topics,
} from "../../db/schema/index.js";

/** The aggregate columns returned by the single read-only query. */
type StoredDashboardCounts = Omit<DashboardCounts, "mailTemplates">;

/**
 * Reads sidebar totals from their owning rows.
 *
 * Entry translations are not counted: an entry is one work however many
 * languages it has, and it counts while one of them is outside the trash. Disabled blocks and accounts remain rows an editor
 * manages, so the administrative total includes them.
 */
export async function readDashboardCounts(db: Pick<Database, "execute">): Promise<DashboardCounts> {
  // An entry counts while one of its languages is outside the trash.
  const kept = sql`exists (
    select 1 from ${entryTranslations}
    where ${entryTranslations.entryId} = ${entries.id} and ${entryTranslations.trashedAt} is null
  )`;
  const [stored] = await db.execute<StoredDashboardCounts>(sql`
    select
      (select count(*)::int from ${entries} where ${entries.kind} = 'post' and ${kept}) as posts,
      (select count(*)::int from ${entries} where ${entries.kind} = 'page' and ${kept}) as pages,
      (select count(*)::int from ${entries} where ${entries.kind} = 'project' and ${kept}) as projects,
      (select count(*)::int from ${topics}) as tags,
      (select count(*)::int from ${forms}) as forms,
      (select count(*)::int from ${formSubmissions} where ${formSubmissions.status} = 'unread') as submissions,
      (select count(*)::int from ${media}) as media,
      (select count(*)::int from ${namedValues}) as "values",
      (select count(*)::int from ${homeBlocks}) as blocks,
      (
        select count(*)::int
        from ${navigationItems}
        inner join ${navigations} on ${navigations.id} = ${navigationItems.navigationId}
        where ${navigations.placement} = 'main'
      ) as "mainNav",
      (select count(*)::int from ${navigations} where ${navigations.placement} = 'footer') as "footerNav",
      (select count(*)::int from ${socialAccounts}) as social
  `);

  if (!stored) throw new Error("The dashboard count query returned no row.");

  // Every kind of template always exists, on its default until somebody edits it.
  return { ...stored, mailTemplates: mailTemplateKind.options.length };
}
