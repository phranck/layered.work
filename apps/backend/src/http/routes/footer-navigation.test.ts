import { randomUUID } from "node:crypto";
import { footerNavigation, footerNavigationList } from "@layered/schemas";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { SESSION_COOKIE } from "../../auth/cookie.js";
import { openSession } from "../../auth/session.js";
import { closeDatabase } from "../../db/connect.js";
import { auditLog, navigations, sessions, users } from "../../db/schema/index.js";
import { closeTestDatabase, hasTestDatabase, testDatabase } from "../../test-support/database.js";
import { app } from "../app.js";

async function navigationOf(response: Response) {
  return z.object({ data: footerNavigation }).parse(await response.json()).data;
}

async function navigationsOf(response: Response) {
  return z.object({ data: footerNavigationList }).parse(await response.json()).data;
}

it("requires a browser session for footer navigation", async () => {
  expect((await app.request("/footer-navigation")).status).toBe(401);
});

const runs = hasTestDatabase ? describe : describe.skip;
runs("editing footer navigation", () => {
  let userId = "";
  let cookie = "";
  const ids: string[] = [];
  beforeAll(async () => {
    const db = await testDatabase();
    const [user] = await db
      .insert(users)
      .values({
        email: `footer-${randomUUID()}@example.test`,
        passwordHash: "test-only",
        displayName: "Footer test",
        role: "owner",
      })
      .returning({ id: users.id });
    userId = user?.id ?? "";
    cookie = `${SESSION_COOKIE}=${(await openSession(db, userId, null)).cookieValue}`;
  });
  afterAll(async () => {
    const db = await testDatabase();
    if (ids.length) await db.delete(navigations).where(inArray(navigations.id, ids));
    if (userId) {
      await db.delete(auditLog).where(eq(auditLog.actorUserId, userId));
      await db.delete(sessions).where(eq(sessions.userId, userId));
      await db.delete(users).where(eq(users.id, userId));
    }
    await closeDatabase();
    await closeTestDatabase();
  });
  const send = (path: string, method: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { cookie, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const item = (name: string) => ({
    label: { en: name, de: `${name} DE` },
    visible: { en: true, de: true },
    entryId: null,
    topicId: null,
    href: "https://example.test/",
  });

  it("creates, renames and orders two bilingual lists and their items", async () => {
    for (const [name, sortOrder] of [
      ["Explore", 10],
      ["Subscribe", 5],
    ] as const) {
      const response = await send("/footer-navigation", "POST", {
        title: { en: name, de: `${name} DE` },
        sortOrder,
        items: [item("First"), item("Second")],
      });
      expect(response.status).toBe(200);
      const created = await navigationOf(response);
      ids.push(created.id);
    }
    const response = await send("/footer-navigation", "GET");
    const own = (await navigationsOf(response)).filter((row) => ids.includes(row.id));
    expect(own.map((row) => row.id)).toEqual([ids[1], ids[0]]);
    const reordered = await send("/footer-navigation/order", "PATCH", {
      positions: ids.map((id, sortOrder) => ({ id, sortOrder })),
    });
    expect(reordered.status).toBe(200);
    expect(
      (await navigationsOf(reordered)).filter((row) => ids.includes(row.id)).map((row) => row.id),
    ).toEqual(ids);
    // A missing group aborts the complete transaction, including the valid row.
    expect(
      (
        await send("/footer-navigation/order", "PATCH", {
          positions: [
            { id: ids[0], sortOrder: 999 },
            { id: randomUUID(), sortOrder: 998 },
          ],
        })
      ).status,
    ).toBe(404);
    const unchanged = (await navigationsOf(await send("/footer-navigation", "GET"))).find(
      (row) => row.id === ids[0],
    );
    expect(unchanged?.sortOrder).toBe(0);
    const first = own[0];
    expect(first).toBeDefined();
    if (!first) throw new Error("No test navigation returned");
    const changed = await send(`/footer-navigation/${first.id}`, "PUT", {
      title: { en: "Renamed", de: "Umbenannt" },
      sortOrder: 20,
      items: [first.items[1], { ...first.items[0], label: { en: "Changed", de: "Geändert" } }],
    });
    expect(changed.status).toBe(200);
    const saved = await navigationOf(changed);
    expect(saved.title.de).toBe("Umbenannt");
    expect(saved.items.map((row: { label: { en: string } }) => row.label.en)).toEqual(["Second", "Changed"]);
    const removed = await send(`/footer-navigation/${first.id}`, "PUT", {
      title: saved.title,
      sortOrder: saved.sortOrder,
      items: [saved.items[0]],
    });
    expect((await navigationOf(removed)).items).toHaveLength(1);
    expect((await send(`/footer-navigation/${first.id}`, "DELETE")).status).toBe(200);
    const remaining = await navigationsOf(await send("/footer-navigation", "GET"));
    expect(remaining.some((row) => row.id === first.id)).toBe(false);
  });

  it("refuses incomplete languages and active URL schemes before writing", async () => {
    for (const value of [
      { title: { en: "Only English", de: "" }, sortOrder: 0, items: [] },
      {
        title: { en: "Unsafe", de: "Unsicher" },
        sortOrder: 0,
        items: [{ ...item("Unsafe"), href: "javascript:alert(1)" }],
      },
    ])
      expect((await send("/footer-navigation", "POST", value)).status).toBe(400);
  });
});
