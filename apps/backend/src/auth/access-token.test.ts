import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { accessTokens, auditLog, users } from "../db/schema/index.js";
import { closeTestDatabase, hasTestDatabase, testDatabase } from "../test-support/database.js";
import { issueAccessToken, listAccessTokens, revokeAccessToken, verifyAccessToken } from "./access-token.js";

const runs = hasTestDatabase ? describe : describe.skip;
let actorId = "";
let tokenId = "";
let raw = "";

runs("personal access tokens", () => {
  beforeAll(async () => {
    const db = await testDatabase();
    const [actor] = await db
      .insert(users)
      .values({
        email: `pat-${randomUUID()}@example.test`,
        passwordHash: "test-only",
        displayName: "PAT test",
        role: "owner",
      })
      .returning({ id: users.id });
    actorId = actor?.id ?? "";
  });
  afterAll(async () => {
    const db = await testDatabase();
    if (tokenId) {
      await db.delete(auditLog).where(eq(auditLog.subjectId, tokenId));
      await db.delete(accessTokens).where(eq(accessTokens.id, tokenId));
    }
    if (actorId) await db.delete(users).where(eq(users.id, actorId));
    await closeTestDatabase();
  });

  it("issues a one-time secret and stores only its hash with its scopes", async () => {
    const db = await testDatabase();
    const issued = await issueAccessToken(db, actorId, {
      name: `writer-${randomUUID()}`,
      scopes: ["content:read", "content:write"],
      expiresAt: null,
    });
    tokenId = issued.id;
    raw = issued.value;
    expect(raw).toMatch(/^lwpat_[A-Za-z0-9_-]{43}$/);
    const [stored] = await db.select().from(accessTokens).where(eq(accessTokens.id, tokenId));
    expect(stored?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(raw);
    expect((await listAccessTokens(db, actorId))[0]).not.toHaveProperty("value");
    expect(await verifyAccessToken(db, raw)).toMatchObject({ tokenId, userId: actorId });
    expect(await verifyAccessToken(db, raw.replace("lwpat_", "layered_session="))).toBeNull();
  });

  it("records use and refuses a revoked token on the next request", async () => {
    const db = await testDatabase();
    expect(
      (await db.select().from(accessTokens).where(eq(accessTokens.id, tokenId)))[0]?.lastUsedAt,
    ).not.toBeNull();
    await revokeAccessToken(db, actorId, tokenId);
    expect(await verifyAccessToken(db, raw)).toBeNull();
    expect((await listAccessTokens(db, actorId))[0]?.revokedAt).not.toBeNull();
  });
});
