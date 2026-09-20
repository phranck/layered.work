import type { DashboardCounts } from "@layered/schemas";
import { sql } from "drizzle-orm";
import type { database } from "../../db/connect.js";
import {
  entries,
  homeBlocks,
  media,
  navigationItems,
  navigations,
  socialAccounts,
  topics,
} from "../../db/schema/index.js";

/** The aggregate columns returned by the single read-only query. */
type StoredDashboardCounts = Omit<DashboardCounts, "forms" | "submissions" | "mailTemplates">;

/**
 * Reads sidebar totals from their owning rows.
 *
 * Entry translations are deliberately absent: an entry is one work however
 * many languages it has. Disabled blocks and accounts remain rows an editor
 * manages, so the administrative total includes them.
 */
export async function readDashboardCounts(
  db: Pick<ReturnType<typeof database>, "execute">,
): Promise<DashboardCounts> {
  const [stored] = await db.execute<StoredDashboardCounts>(sql`
    select
      (select count(*)::int from ${entries} where ${entries.kind} = 'post') as posts,
      (select count(*)::int from ${entries} where ${entries.kind} = 'page') as pages,
      (select count(*)::int from ${topics}) as tags,
      (select count(*)::int from ${media}) as media,
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

  return {
    ...stored,
    forms: null,
    submissions: null,
    mailTemplates: null,
  };
}
