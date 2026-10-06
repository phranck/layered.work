import { randomUUID } from "node:crypto";
import { homeBlock, homeBlockList, homeBlockSettings, homeBlockTypes, readApiError } from "@layered/schemas";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { SESSION_COOKIE } from "../../auth/cookie.js";
import { openSession } from "../../auth/session.js";
import { closeDatabase } from "../../db/connect.js";
import { auditLog, homeBlocks, sessions, users } from "../../db/schema/index.js";
import { closeTestDatabase, hasTestDatabase, testDatabase } from "../../test-support/database.js";
import { app } from "../app.js";

/**
 * The home page's blocks over HTTP, against the test database.
 *
 * The table holds one page, so this suite owns every row in it while it runs
 * and empties it before and after. Nothing else in the suite writes blocks.
 */

it("requires a browser session for the home page's blocks", async () => {
  expect((await app.request("/home-blocks")).status).toBe(401);
});

const runs = hasTestDatabase ? describe : describe.skip;
runs("arranging the home page", () => {
  const accounts: { id: string; cookie: string }[] = [];
  const owner = () => accounts[0]?.cookie ?? "";
  const editor = () => accounts[1]?.cookie ?? "";

  beforeAll(async () => {
    const db = await testDatabase();
    await db.delete(homeBlocks);
    for (const role of ["owner", "editor"] as const) {
      const [user] = await db
        .insert(users)
        .values({
          email: `blocks-${role}-${randomUUID()}@example.test`,
          passwordHash: "test-only",
          displayName: `Blocks ${role}`,
          role,
        })
        .returning({ id: users.id });
      if (!user) throw new Error("No test account");
      accounts.push({
        id: user.id,
        cookie: `${SESSION_COOKIE}=${(await openSession(db, user.id, null)).cookieValue}`,
      });
    }
  });

  afterAll(async () => {
    const db = await testDatabase();
    await db.delete(homeBlocks);
    const ids = accounts.map((account) => account.id);
    if (ids.length) {
      await db.delete(auditLog).where(inArray(auditLog.actorUserId, ids));
      await db.delete(sessions).where(inArray(sessions.userId, ids));
      await db.delete(users).where(inArray(users.id, ids));
    }
    await closeDatabase();
    await closeTestDatabase();
  });

  const send = (cookie: string, path: string, method: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { cookie, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const listOf = async (response: Response) =>
    z.object({ data: homeBlockList }).parse(await response.json()).data;
  const blockOf = async (response: Response) =>
    z.object({ data: homeBlock }).parse(await response.json()).data;

  it("arranges the declared blocks the first time anybody asks, once", async () => {
    const [first, second] = await Promise.all([
      send(editor(), "/home-blocks", "GET"),
      send(owner(), "/home-blocks", "GET"),
    ]);
    const blocks = await listOf(first);
    expect(blocks.map((block) => block.type)).toEqual([...homeBlockTypes]);
    expect((await listOf(second)).map((block) => block.id)).toEqual(blocks.map((block) => block.id));
    expect(blocks[3]?.settings).toEqual(homeBlockSettings("post_grid", {}));
  });

  it("saves settings the declaration accepts and refuses others, naming the setting", async () => {
    const grid = (await listOf(await send(owner(), "/home-blocks", "GET"))).find(
      (block) => block.type === "post_grid",
    );
    if (!grid) throw new Error("No post grid");
    const settings = { ...grid.settings, title: { en: "Latest", de: "Neueste" }, limit: 9, order: "title" };
    const saved = await send(owner(), `/home-blocks/${grid.id}`, "PUT", { enabled: false, settings });
    expect(saved.status).toBe(200);
    expect(await blockOf(saved)).toMatchObject({ enabled: false, settings });

    const refused = await send(owner(), `/home-blocks/${grid.id}`, "PUT", {
      enabled: true,
      settings: { ...settings, order: "sideways" },
    });
    expect(refused.status).toBe(400);
    expect(readApiError(await refused.json())?.message).toMatch(/order/);

    for (const wrong of [
      { ...settings, color: "red" },
      { ...settings, limit: 25 },
    ])
      expect(
        (await send(owner(), `/home-blocks/${grid.id}`, "PUT", { enabled: true, settings: wrong })).status,
      ).toBe(400);
    expect((await send(editor(), `/home-blocks/${grid.id}`, "PUT", { enabled: true, settings })).status).toBe(
      403,
    );

    const db = await testDatabase();
    const [audit] = await db.select().from(auditLog).where(eq(auditLog.subjectId, grid.id));
    expect(audit?.detail).toMatchObject({ type: "post_grid", changedKeys: ["title", "limit", "order"] });
    expect(JSON.stringify(audit?.detail)).not.toContain("Latest");
  });

  it("refuses a picture that is not in the library", async () => {
    const hero = (await listOf(await send(owner(), "/home-blocks", "GET")))[0];
    if (!hero) throw new Error("No hero");
    const response = await send(owner(), `/home-blocks/${hero.id}`, "PUT", {
      enabled: true,
      settings: { ...hero.settings, picture: randomUUID() },
    });
    expect(response.status).toBe(400);
  });

  it("adds a block at the end, but never a second hero", async () => {
    expect((await send(owner(), "/home-blocks", "POST", { type: "hero" })).status).toBe(409);
    const added = await blockOf(await send(owner(), "/home-blocks", "POST", { type: "topic_bar" }));
    const blocks = await listOf(await send(owner(), "/home-blocks", "GET"));
    expect(blocks.at(-1)?.id).toBe(added.id);
    expect((await send(editor(), "/home-blocks", "POST", { type: "post_grid" })).status).toBe(403);
  });

  it("orders the blocks, keeping the hero first", async () => {
    const blocks = await listOf(await send(owner(), "/home-blocks", "GET"));
    const [hero, ...rest] = blocks;
    if (!hero) throw new Error("No hero");
    const reversed = [hero, ...rest.reverse()].map((block, sortOrder) => ({ id: block.id, sortOrder }));
    const ordered = await send(owner(), "/home-blocks/order", "PATCH", { positions: reversed });
    expect(ordered.status).toBe(200);
    expect((await listOf(ordered)).map((block) => block.id)).toEqual(reversed.map((position) => position.id));

    const above = await send(owner(), "/home-blocks/order", "PATCH", {
      positions: [
        { id: rest[0]?.id, sortOrder: 0 },
        { id: hero.id, sortOrder: 1 },
      ],
    });
    expect(above.status).toBe(409);
    expect((await listOf(await send(owner(), "/home-blocks", "GET")))[0]?.id).toBe(hero.id);
  });

  it("removes a block for good, but not the hero", async () => {
    const blocks = await listOf(await send(owner(), "/home-blocks", "GET"));
    const [hero, removable] = [blocks[0], blocks.at(-1)];
    if (!hero || !removable) throw new Error("No blocks");
    expect((await send(owner(), `/home-blocks/${hero.id}`, "DELETE")).status).toBe(409);
    expect((await send(owner(), `/home-blocks/${removable.id}`, "DELETE")).status).toBe(200);
    const remaining = await listOf(await send(owner(), "/home-blocks", "GET"));
    expect(remaining.some((block) => block.id === removable.id)).toBe(false);
  });
});
