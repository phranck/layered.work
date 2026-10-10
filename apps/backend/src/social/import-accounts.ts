import { randomUUID } from "node:crypto";
import { type SaveSocialAccountBody, saveSocialAccountBody } from "@layered/schemas";
import { eq, sql } from "drizzle-orm";
import { closeDatabase, type Database, database } from "../db/connect.js";
import { settings, socialAccounts } from "../db/schema/index.js";
import { logger } from "../logger.js";

/** Exact footer hrefs from the local Publii output, including Xing's web_profiles path. */
export const ORIGINAL_SOCIAL_ACCOUNTS: SaveSocialAccountBody[] = [
  {
    platform: "mastodon",
    handle: "@LAYERED@oldbytes.space",
    href: "https://oldbytes.space/@LAYERED",
    enabled: true,
    sortOrder: 0,
  },
  {
    platform: "github",
    handle: "LAYEREDwork",
    href: "https://github.com/LAYEREDwork",
    enabled: true,
    sortOrder: 1,
  },
  {
    platform: "youtube",
    handle: "@LAYEREDwork",
    href: "https://www.youtube.com/@LAYEREDwork",
    enabled: true,
    sortOrder: 2,
  },
  {
    platform: "instagram",
    handle: "layered.work",
    href: "https://www.instagram.com/layered.work/",
    enabled: true,
    sortOrder: 3,
  },
  {
    platform: "xing",
    handle: "Frank_Gregor063742",
    href: "https://www.xing.com/profile/Frank_Gregor063742/web_profiles",
    enabled: true,
    sortOrder: 4,
  },
];
/** An application-data import marker preserves later edits, disables and deletions across deploys. */
export async function importSocialAccounts(
  db: Database,
  accounts: (SaveSocialAccountBody & { id?: string })[],
  marker: string,
): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${marker}))`);
    if ((await tx.select().from(settings).where(eq(settings.key, marker))).length) return 0;
    let imported = 0;
    for (const account of accounts) {
      const { id: _id, ...fields } = account;
      const value = saveSocialAccountBody.parse(fields);
      imported += (
        await tx
          .insert(socialAccounts)
          .values({ ...value, ...(account.id ? { id: account.id } : {}) })
          .onConflictDoNothing({ target: socialAccounts.href })
          .returning({ id: socialAccounts.id })
      ).length;
    }
    await tx.insert(settings).values({ key: marker, value: { imported: true } });
    return imported;
  });
}
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.stdout.write(
      `social accounts imported: ${await importSocialAccounts(database(), ORIGINAL_SOCIAL_ACCOUNTS, "import.publii-social-accounts.v1")}\n`,
    );
  } catch (cause) {
    logger.error(
      {
        code: "SOCIAL_ACCOUNT_IMPORT_FAILED",
        errorId: randomUUID(),
        operation: "import_social_accounts",
        status: 503,
        result: "deployment_stopped",
        cause: cause instanceof Error ? cause.name : "UnknownError",
      },
      "social account import failed",
    );
    process.exitCode = 1;
  } finally {
    await closeDatabase();
  }
}
