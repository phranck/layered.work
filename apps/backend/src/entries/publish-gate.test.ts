import { randomUUID } from "node:crypto";
import { readApiError } from "@layered/schemas";
import { eq } from "drizzle-orm";
import { afterAll, expect, it } from "vitest";
import { SESSION_COOKIE } from "../auth/cookie.js";
import { openSession } from "../auth/session.js";
import { closeDatabase } from "../db/connect.js";
import { auditLog, entries, entryTranslations, sessions, users } from "../db/schema/index.js";
import { app } from "../http/app.js";
import { closeTestDatabase, hasTestDatabase, testDatabase } from "../test-support/database.js";

afterAll(async () => {
  await closeDatabase();
  await closeTestDatabase();
});
it.skipIf(!hasTestDatabase)(
  "allows invalid drafts but refuses public and hidden API saves with the component and position",
  async () => {
    const db = await testDatabase();
    const userId = randomUUID(),
      entryId = randomUUID(),
      id = randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `gate-${userId}@example.test`,
      passwordHash: "test",
      displayName: "Gate fixture",
      role: "owner",
    });
    await db.insert(entries).values({ id: entryId, kind: "post" });
    await db.insert(entryTranslations).values({ id, entryId, language: "en", title: "Gate fixture" });
    const cookie = `${SESSION_COOKIE}=${(await openSession(db, userId, null)).cookieValue}`;
    const value = {
      title: "Gate fixture",
      summary: null,
      body: "First line.\n\nCarousel {\n  Mistake\n}",
      state: "draft",
      readingWidth: "normal",
      showInOtherLanguage: false,
      topicIds: [],
      slug: `gate-${id}`,
    };
    try {
      const send = (state: string) =>
        app.request(`/entries/${id}`, {
          method: "PUT",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify({ ...value, state }),
        });
      expect((await send("draft")).status).toBe(200);
      for (const state of ["public", "hidden"]) {
        const response = await send(state);
        expect(response.status).toBe(400);
        const failure = readApiError(await response.json());
        expect(failure?.code).toBe("invalid_request");
        expect(failure?.id).toBeTruthy();
        expect(failure?.message).toContain("Carousel");
        expect(failure?.message).toContain("3:1");
      }
      expect((await db.select().from(entryTranslations).where(eq(entryTranslations.id, id)))[0]?.state).toBe(
        "draft",
      );
    } finally {
      await db.delete(entries).where(eq(entries.id, entryId));
      await db.delete(auditLog).where(eq(auditLog.actorUserId, userId));
      await db.delete(sessions).where(eq(sessions.userId, userId));
      await db.delete(users).where(eq(users.id, userId));
    }
  },
);
