import { randomUUID } from "node:crypto";
import { entryDetail, readApiError, type SaveEntryBody } from "@layered/schemas";
import { eq, or } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { issueAccessToken } from "../../auth/access-token.js";
import { SESSION_COOKIE } from "../../auth/cookie.js";
import { openSession } from "../../auth/session.js";
import { closeDatabase } from "../../db/connect.js";
import { auditLog, entries, entryTranslations, paths, users } from "../../db/schema/index.js";
import { closeTestDatabase, hasTestDatabase, testDatabase } from "../../test-support/database.js";
import { app } from "../app.js";

const entryId = randomUUID();
const translationId = randomUUID();
const userId = randomUUID();
const slug = `model-probe-${entryId}`;
const validBody = 'Model("cube", alt: "A wooden cube")';
let cookie = "";
let token = "";
const runs = hasTestDatabase ? describe : describe.skip;

runs("publishing model descriptions through the API", () => {
  beforeAll(async () => {
    const db = await testDatabase();
    await db.insert(users).values({
      id: userId,
      email: `${slug}@example.test`,
      passwordHash: "test-only",
      displayName: "Model test",
      role: "owner",
    });
    await db.insert(entries).values({ id: entryId, kind: "post" });
    await db
      .insert(entryTranslations)
      .values({ id: translationId, entryId, language: "en", title: "Model test" });
    await db.insert(paths).values({ translationId, path: `/en/${slug}/` });
    cookie = `${SESSION_COOKIE}=${(await openSession(db, userId, null)).cookieValue}`;
    token = (
      await issueAccessToken(db, userId, {
        name: "model-test",
        scopes: ["content:write", "content:publish"],
        expiresAt: null,
      })
    ).value;
  });
  beforeEach(async () => {
    const db = await testDatabase();
    await db.delete(auditLog).where(eq(auditLog.subjectId, translationId));
    await db
      .update(entryTranslations)
      .set({ body: "Original draft", state: "draft", publishedAt: null, trashedAt: null })
      .where(eq(entryTranslations.id, translationId));
  });
  afterAll(async () => {
    const db = await testDatabase();
    await db
      .delete(auditLog)
      .where(or(eq(auditLog.actorUserId, userId), eq(auditLog.subjectId, translationId)));
    await db.delete(entries).where(eq(entries.id, entryId));
    await db.delete(users).where(eq(users.id, userId));
    await closeDatabase();
    await closeTestDatabase();
  });
  const save = (body: string, state: SaveEntryBody["state"], bearer = false) =>
    app.request(`/entries/${translationId}`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        ...(bearer ? { authorization: `Bearer ${token}` } : { cookie }),
      },
      body: JSON.stringify({
        title: "Model test",
        summary: null,
        body,
        state,
        readingWidth: "normal",
        showInOtherLanguage: false,
        topicIds: [],
        slug,
      } satisfies SaveEntryBody),
    });

  it.each([
    false,
    true,
  ])("refuses missing and blank descriptions before writing (bearer: %s)", async (bearer) => {
    for (const state of ["public", "hidden"] as const) {
      for (const body of ['Model("cube")', 'Model("cube", alt: "")', 'Model("cube", alt: "   ")']) {
        const response = await save(body, state, bearer);
        expect(response.status).toBe(400);
        expect(readApiError(await response.json())).toMatchObject({
          code: "invalid_request",
          id: expect.any(String),
        });
      }
    }
    const db = await testDatabase();
    expect(
      await db
        .select({
          body: entryTranslations.body,
          state: entryTranslations.state,
          publishedAt: entryTranslations.publishedAt,
        })
        .from(entryTranslations)
        .where(eq(entryTranslations.id, translationId)),
    ).toEqual([{ body: "Original draft", state: "draft", publishedAt: null }]);
    expect(await db.select().from(auditLog).where(eq(auditLog.subjectId, translationId))).toEqual([]);
  });

  it("allows incomplete drafts, then publishes a described model and protects later corrections", async () => {
    expect((await save('Model("cube")', "draft")).status).toBe(200);
    const published = await save(validBody, "public");
    expect(published.status).toBe(200);
    const detail = z.object({ data: entryDetail }).parse(await published.json()).data;
    expect(detail).toMatchObject({ body: validBody, state: "public", publishedAt: expect.any(String) });
    expect((await save('Model("cube")', "public")).status).toBe(400);
    const response = await app.request(`/entries/${translationId}`, { headers: { cookie } });
    expect(z.object({ data: entryDetail }).parse(await response.json()).data).toEqual(detail);
  });

  it("refuses restoring an invalid published model and leaves it in the trash", async () => {
    const db = await testDatabase();
    const trashedAt = new Date();
    await db
      .update(entryTranslations)
      .set({ state: "public", body: 'Model("cube")', trashedAt })
      .where(eq(entryTranslations.id, translationId));
    expect(
      (await app.request(`/entries/${translationId}/restore`, { method: "POST", headers: { cookie } }))
        .status,
    ).toBe(400);
    expect(
      await db
        .select({ trashedAt: entryTranslations.trashedAt })
        .from(entryTranslations)
        .where(eq(entryTranslations.id, translationId)),
    ).toEqual([{ trashedAt }]);
    await db
      .update(entryTranslations)
      .set({ body: validBody })
      .where(eq(entryTranslations.id, translationId));
    expect(
      (await app.request(`/entries/${translationId}/restore`, { method: "POST", headers: { cookie } }))
        .status,
    ).toBe(200);
  });
});
