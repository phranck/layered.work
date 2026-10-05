import {
  ErrorCode,
  type SaveSocialAccountBody,
  type SocialAccount,
  socialAccountList,
} from "@layered/schemas";
import { asc, eq, inArray } from "drizzle-orm";
import type { database } from "../db/connect.js";
import { auditLog, socialAccounts } from "../db/schema/index.js";
import { HttpError } from "../http/response.js";

type Database = ReturnType<typeof database>;
export async function listSocialAccounts(db: Database): Promise<SocialAccount[]> {
  return socialAccountList.parse(
    await db
      .select({
        id: socialAccounts.id,
        platform: socialAccounts.platform,
        handle: socialAccounts.handle,
        href: socialAccounts.href,
        enabled: socialAccounts.enabled,
        sortOrder: socialAccounts.sortOrder,
      })
      .from(socialAccounts)
      .orderBy(asc(socialAccounts.sortOrder), asc(socialAccounts.id)),
  );
}
export async function saveSocialAccount(
  db: Database,
  id: string | null,
  value: SaveSocialAccountBody,
  actorUserId: string,
): Promise<SocialAccount> {
  const result = await db.transaction(async (tx) => {
    if (
      (
        await tx
          .select({ id: socialAccounts.id })
          .from(socialAccounts)
          .where(eq(socialAccounts.href, value.href))
      ).some((row) => row.id !== id)
    )
      throw new HttpError(ErrorCode.Conflict, "That account address is already configured.");
    const [row] = id
      ? await tx.update(socialAccounts).set(value).where(eq(socialAccounts.id, id)).returning()
      : await tx.insert(socialAccounts).values(value).returning();
    if (!row) throw new HttpError(ErrorCode.NotFound, "That social account does not exist.");
    await tx.insert(auditLog).values({
      actorUserId,
      action: id ? "social.updated" : "social.created",
      subjectType: "social_accounts",
      subjectId: row.id,
      detail: { platform: value.platform, enabled: value.enabled },
    });
    return row;
  });
  return { ...value, id: result.id };
}
export async function deleteSocialAccount(db: Database, id: string, actorUserId: string) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .delete(socialAccounts)
      .where(eq(socialAccounts.id, id))
      .returning({ id: socialAccounts.id });
    if (!row) throw new HttpError(ErrorCode.NotFound, "That social account does not exist.");
    await tx
      .insert(auditLog)
      .values({ actorUserId, action: "social.deleted", subjectType: "social_accounts", subjectId: id });
  });
}
export async function reorderSocialAccounts(
  db: Database,
  positions: { id: string; sortOrder: number }[],
  actorUserId: string,
) {
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: socialAccounts.id })
      .from(socialAccounts)
      .where(
        inArray(
          socialAccounts.id,
          positions.map((row) => row.id),
        ),
      )
      .orderBy(asc(socialAccounts.id))
      .for("update");
    if (rows.length !== positions.length)
      throw new HttpError(ErrorCode.NotFound, "A social account no longer exists.");
    for (const row of positions) {
      await tx.update(socialAccounts).set({ sortOrder: row.sortOrder }).where(eq(socialAccounts.id, row.id));
      await tx.insert(auditLog).values({
        actorUserId,
        action: "social.reordered",
        subjectType: "social_accounts",
        subjectId: row.id,
        detail: { sortOrder: row.sortOrder },
      });
    }
  });
  return listSocialAccounts(db);
}
