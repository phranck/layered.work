import { randomUUID } from "node:crypto";
import { entryDetail, issuedToken, tokenList } from "@layered/schemas";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SESSION_COOKIE } from "../../auth/cookie.js";
import { openSession } from "../../auth/session.js";
import { closeDatabase } from "../../db/connect.js";
import { accessTokens, auditLog, entries, sessions, users } from "../../db/schema/index.js";
import { closeTestDatabase, hasTestDatabase, testDatabase } from "../../test-support/database.js";
import { app } from "../app.js";
import { forgetRateLimits } from "../rate-limit.js";

const runs = hasTestDatabase ? describe : describe.skip;
let userId = "";
let entryId = "";
let translationId = "";
let cookie = "";
const tokenIds: string[] = [];

runs("scoped bearer requests", () => {
  beforeAll(async () => {
    const db = await testDatabase();
    const [user] = await db
      .insert(users)
      .values({
        email: `scoped-${randomUUID()}@example.test`,
        passwordHash: "test-only",
        displayName: "Scoped test",
        role: "owner",
      })
      .returning({ id: users.id });
    userId = user?.id ?? "";
    cookie = `${SESSION_COOKIE}=${(await openSession(db, userId, null)).cookieValue}`;
  });
  afterAll(async () => {
    const db = await testDatabase();
    if (translationId) await db.delete(auditLog).where(eq(auditLog.subjectId, translationId));
    if (entryId) await db.delete(entries).where(eq(entries.id, entryId));
    if (tokenIds.length) {
      await db.delete(auditLog).where(inArray(auditLog.subjectId, tokenIds));
      await db.delete(accessTokens).where(inArray(accessTokens.id, tokenIds));
    }
    if (userId) {
      await db.delete(sessions).where(eq(sessions.userId, userId));
      await db.delete(users).where(eq(users.id, userId));
    }
    await closeDatabase();
    await closeTestDatabase();
  });

  const issue = async (name: string, scopes: string[]) => {
    const response = await app.request("/access-tokens", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ name, scopes, expiresAt: null }),
    });
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const issued = issuedToken.parse(((await response.json()) as { data: unknown }).data);
    tokenIds.push(issued.id);
    return issued;
  };

  it("issues once through the cookie route and refuses a missing read or publish scope", async () => {
    const write = await issue(`writer-${randomUUID()}`, ["content:write"]);
    const listed = await app.request("/access-tokens", { headers: { cookie } });
    expect(tokenList.parse(((await listed.json()) as { data: unknown }).data)[0]).not.toHaveProperty("value");
    const bearer = { authorization: `Bearer ${write.value}` };
    const created = await app.request("/entries", {
      method: "POST",
      headers: { ...bearer, "content-type": "application/json" },
      body: JSON.stringify({ kind: "page", title: "Scoped test page" }),
    });
    expect(created.status).toBe(200);
    const detail = entryDetail.parse(((await created.json()) as { data: unknown }).data);
    entryId = detail.entryId;
    translationId = detail.id;
    const read = await app.request(`/entries/${detail.id}`, { headers: bearer });
    expect(read.status).toBe(403);
    expect(((await read.json()) as { error: { message: string } }).error.message).toContain("content:read");

    const save = {
      title: "Scoped test page",
      summary: null,
      body: "Published text",
      state: "public",
      readingWidth: "normal",
      showInOtherLanguage: false,
      slug: `scoped-${randomUUID()}`,
      topicIds: [],
      specs: [],
    };
    const refused = await app.request(`/entries/${detail.id}`, {
      method: "PUT",
      headers: { ...bearer, "content-type": "application/json" },
      body: JSON.stringify(save),
    });
    expect(refused.status).toBe(403);
    expect(((await refused.json()) as { error: { message: string } }).error.message).toContain(
      "content:publish",
    );
    const publisher = await issue(`publisher-${randomUUID()}`, ["content:write", "content:publish"]);
    const published = await app.request(`/entries/${detail.id}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${publisher.value}`, "content-type": "application/json" },
      body: JSON.stringify(save),
    });
    expect(published.status).toBe(200);
    const rows = await (await testDatabase())
      .select()
      .from(auditLog)
      .where(eq(auditLog.subjectId, detail.id));
    expect(rows.find((row) => row.action === "entry.published")).toMatchObject({
      actorTokenId: publisher.id,
      actorUserId: null,
    });
    expect(rows.find((row) => row.action === "entry.created")).toMatchObject({
      actorTokenId: write.id,
      actorUserId: null,
    });

    const revoked = await app.request(`/access-tokens/${publisher.id}`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(revoked.status).toBe(200);
    expect(
      (
        await app.request(`/entries/${detail.id}/translation`, {
          method: "POST",
          headers: { authorization: `Bearer ${publisher.value}` },
        })
      ).status,
    ).toBe(401);
    expect(
      (await app.request(`/entries/${detail.id}`, { headers: { authorization: `Bearer ${cookie}` } })).status,
    ).toBe(401);
    expect(
      (
        await app.request(`/entries/${detail.id}`, {
          headers: { cookie: `${SESSION_COOKIE}=${write.value}` },
        })
      ).status,
    ).toBe(401);
  });

  it("limits bearer requests by source and by token across sources", async () => {
    forgetRateLimits();
    const reader = await issue(`reader-${randomUUID()}`, ["content:read"]);
    const request = (source: string) =>
      app.request("/entries?kind=page", {
        headers: {
          authorization: `Bearer ${reader.value}`,
          "x-forwarded-for": `${source}, 10.0.0.9`,
        },
      });

    for (let index = 0; index < 60; index += 1) expect((await request("198.51.100.1")).status).toBe(200);
    expect((await request("198.51.100.1")).status).toBe(429);
    for (let index = 0; index < 60; index += 1) expect((await request("198.51.100.2")).status).toBe(200);
    expect((await request("198.51.100.3")).status).toBe(429);
    forgetRateLimits();
  });
});
