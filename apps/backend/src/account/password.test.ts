import { randomUUID } from "node:crypto";
import { hashPassword, verifyPassword } from "@layered/passwords";
import { ErrorCode } from "@layered/schemas";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openSession } from "../auth/session.js";
import { auditLog, sessions, users } from "../db/schema/index.js";
import { HttpError } from "../http/response.js";
import { closeTestDatabase, hasTestDatabase, testDatabase } from "../test-support/database.js";
import { changeAccountPassword } from "./password.js";

const runs = hasTestDatabase ? describe : describe.skip;

/** The two accounts this suite creates, and nothing else is touched. */
const created: string[] = [];
let authorId = "";
let otherAuthorId = "";

/** Every session of one account, by id. */
async function sessionIds(userId: string): Promise<string[]> {
  const db = await testDatabase();
  return (await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId))).map(
    (row) => row.id,
  );
}

/** Opens a session for an account and returns its id. */
async function sessionFor(userId: string): Promise<string> {
  const db = await testDatabase();
  const before = new Set(await sessionIds(userId));
  await openSession(db, userId, "password test");
  const id = (await sessionIds(userId)).find((each) => !before.has(each));
  if (!id) throw new Error("The session was not stored.");
  return id;
}

runs("changing the password", () => {
  beforeAll(async () => {
    const db = await testDatabase();
    const passwordHash = await hashPassword("old secret");
    const rows = await db
      .insert(users)
      .values([
        {
          email: `password-${randomUUID()}@example.test`,
          passwordHash,
          displayName: "Author",
          role: "owner",
        },
        {
          email: `password-${randomUUID()}@example.test`,
          passwordHash,
          displayName: "Other",
          role: "editor",
        },
      ])
      .returning({ id: users.id });
    authorId = rows[0]?.id ?? "";
    otherAuthorId = rows[1]?.id ?? "";
    created.push(authorId, otherAuthorId);
  });

  afterAll(async () => {
    const db = await testDatabase();
    if (created.length) {
      await db.delete(auditLog).where(inArray(auditLog.subjectId, created));
      await db.delete(sessions).where(inArray(sessions.userId, created));
      await db.delete(users).where(inArray(users.id, created));
    }
    await closeTestDatabase();
  });

  it("refuses a wrong current password and changes nothing", async () => {
    const db = await testDatabase();
    const current = await sessionFor(authorId);
    const other = await sessionFor(authorId);

    const failure = await changeAccountPassword(db, authorId, current, {
      currentPassword: "not it",
      newPassword: "new secret",
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(HttpError);
    expect((failure as HttpError).code).toBe(ErrorCode.Forbidden);
    const [row] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, authorId));
    expect(await verifyPassword("old secret", row?.hash ?? "")).toBe(true);
    expect(await sessionIds(authorId)).toEqual(expect.arrayContaining([current, other]));
  });

  it("stores the new password, ends the account's other sessions and keeps this one and everybody else's", async () => {
    const db = await testDatabase();
    const current = await sessionFor(authorId);
    await sessionFor(authorId);
    const elsewhere = await sessionFor(otherAuthorId);
    const othersBefore = (await sessionIds(authorId)).filter((id) => id !== current).length;

    const changed = await changeAccountPassword(db, authorId, current, {
      currentPassword: "old secret",
      newPassword: "new secret",
    });

    expect(changed).toEqual({ otherSessionsEnded: othersBefore });
    expect(await sessionIds(authorId)).toEqual([current]);
    expect(await sessionIds(otherAuthorId)).toContain(elsewhere);
    const [row] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, authorId));
    expect(await verifyPassword("new secret", row?.hash ?? "")).toBe(true);
    expect(await verifyPassword("old secret", row?.hash ?? "")).toBe(false);

    const [audit] = await db.select().from(auditLog).where(eq(auditLog.subjectId, authorId));
    expect(audit).toMatchObject({
      actorUserId: authorId,
      action: "account.password_changed",
      detail: { otherSessionsEnded: othersBefore },
    });
    expect(JSON.stringify(audit)).not.toContain("secret");
  });
});
