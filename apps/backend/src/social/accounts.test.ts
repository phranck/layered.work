import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDatabase } from "../db/connect.js";
import { auditLog, settings, socialAccounts, users } from "../db/schema/index.js";
import { app } from "../http/app.js";
import { readPublicSiteFrame } from "../settings/repository.js";
import { closeTestDatabase, hasTestDatabase, testDatabase } from "../test-support/database.js";
import { listSocialAccounts, reorderSocialAccounts, saveSocialAccount } from "./accounts.js";
import { importSocialAccounts } from "./import-accounts.js";

it("requires a session for social accounts", async () => {
  expect((await app.request("/social-accounts")).status).toBe(401);
});
(hasTestDatabase ? describe : describe.skip)("social accounts", () => {
  const ids: string[] = [];
  const actor = randomUUID();
  const marker = `test.social-import.${randomUUID()}`;
  afterAll(async () => {
    const db = await testDatabase();
    if (ids.length) await db.delete(socialAccounts).where(inArray(socialAccounts.id, ids));
    await db.delete(settings).where(eq(settings.key, marker));
    await db.delete(auditLog).where(eq(auditLog.actorUserId, actor));
    await db.delete(users).where(eq(users.id, actor));
    await closeDatabase();
    await closeTestDatabase();
  });
  it("creates and edits a shipped mark, reorders atomically and hides without deleting", async () => {
    const db = await testDatabase();
    await db.insert(users).values({
      id: actor,
      email: `social-${actor}@example.test`,
      passwordHash: "test",
      displayName: "Social test",
      role: "owner",
    });
    for (const platform of ["github", "mastodon"] as const) {
      const account = await saveSocialAccount(
        db,
        null,
        {
          platform,
          handle: "Own fixture",
          href: `https://example.test/${randomUUID()}`,
          enabled: true,
          sortOrder: 100,
        },
        actor,
      );
      ids.push(account.id);
    }
    const first = (await listSocialAccounts(db)).find((row) => row.id === ids[0]);
    if (!first) throw new Error("Missing own fixture");
    expect((await readPublicSiteFrame(db)).social.some((row) => row.href === first.href)).toBe(true);
    await saveSocialAccount(db, first.id, { ...first, enabled: false, handle: "Changed" }, actor);
    expect((await readPublicSiteFrame(db)).social.some((row) => row.href === first.href)).toBe(false);
    expect((await listSocialAccounts(db)).find((row) => row.id === first.id)?.handle).toBe("Changed");
    await reorderSocialAccounts(
      db,
      ids.map((id, index) => ({ id, sortOrder: 100 - index })),
      actor,
    );
    expect((await listSocialAccounts(db)).filter((row) => ids.includes(row.id)).map((row) => row.id)).toEqual(
      [...ids].reverse(),
    );
    await expect(
      reorderSocialAccounts(
        db,
        [
          { id: first.id, sortOrder: 0 },
          { id: randomUUID(), sortOrder: 1 },
        ],
        actor,
      ),
    ).rejects.toThrow("no longer exists");
    expect((await listSocialAccounts(db)).find((row) => row.id === first.id)?.sortOrder).toBe(100);
  });
  it("imports exact addresses once and does not resurrect removed accounts", async () => {
    const db = await testDatabase();
    const id = randomUUID();
    ids.push(id);
    const values = [
      {
        id,
        platform: "xing" as const,
        handle: "Own fixture",
        href: `https://example.test/${id}/web_profiles`,
        enabled: true,
        sortOrder: 5,
      },
    ];
    expect(await importSocialAccounts(db, values, marker)).toBe(1);
    await db.delete(socialAccounts).where(eq(socialAccounts.id, id));
    expect(await importSocialAccounts(db, values, marker)).toBe(0);
    expect((await listSocialAccounts(db)).some((row) => row.id === id)).toBe(false);
  });
});
