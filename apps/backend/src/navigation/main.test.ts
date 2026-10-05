import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDatabase } from "../db/connect.js";
import { auditLog, entries, navigations, topics, users } from "../db/schema/index.js";
import { app } from "../http/app.js";
import { closeTestDatabase, hasTestDatabase, testDatabase } from "../test-support/database.js";
import { readPublicNavigation } from "./public.js";
import { deleteFooterNavigation, listFooterNavigations, saveFooterNavigation } from "./repository.js";

it("requires a session for main navigation", async () => {
  expect((await app.request("/main-navigation")).status).toBe(401);
});

(hasTestDatabase ? describe : describe.skip)("main navigation", () => {
  let actor = "";
  const groups: string[] = [];
  const targetEntries: string[] = [];
  const targetTopics: string[] = [];
  beforeAll(async () => {
    const db = await testDatabase();
    const [user] = await db
      .insert(users)
      .values({
        email: `main-${randomUUID()}@example.test`,
        passwordHash: "test",
        displayName: "Navigation test",
        role: "owner",
      })
      .returning();
    actor = user?.id ?? "";
  });
  afterAll(async () => {
    const db = await testDatabase();
    if (groups.length) await db.delete(navigations).where(inArray(navigations.id, groups));
    if (targetEntries.length) await db.delete(entries).where(inArray(entries.id, targetEntries));
    if (targetTopics.length) await db.delete(topics).where(inArray(topics.id, targetTopics));
    await db.delete(auditLog).where(eq(auditLog.actorUserId, actor));
    await db.delete(users).where(eq(users.id, actor));
    await closeDatabase();
    await closeTestDatabase();
  });
  it("preserves one level, language visibility and order; refuses foreign ids and deeper nesting", async () => {
    const db = await testDatabase();
    const rootId = randomUUID();
    const childId = randomUUID();
    const link = (id: string, label: string, parentId: string | null = null) => ({
      id,
      label: { en: label, de: `${label} DE` },
      visible: { en: true, de: true },
      entryId: null,
      topicId: null,
      href: "/posts/",
      parentId,
    });
    const value = {
      title: { en: "Main", de: "Hauptnavigation" },
      sortOrder: 0,
      items: [link(rootId, "Root"), { ...link(childId, "Child", rootId), visible: { en: true, de: false } }],
    };
    const main = await saveFooterNavigation(db, null, value, actor, "main");
    groups.push(main.id);
    expect(main.items.map((item) => item.id)).toEqual([rootId, childId]);
    const publicNav = await readPublicNavigation(db, [], [], "main");
    expect(publicNav.en.find((group) => group.title === "Main")?.items).toEqual([
      { label: "Root", href: "/posts/", children: [{ label: "Child", href: "/posts/" }] },
    ]);
    expect(publicNav.de.find((group) => group.title === "Hauptnavigation")?.items).toEqual([
      { label: "Root DE", href: "/posts/" },
    ]);
    expect((await listFooterNavigations(db)).some((group) => group.id === main.id)).toBe(false);
    await expect(
      saveFooterNavigation(
        db,
        main.id,
        { ...value, items: [...value.items, link(randomUUID(), "Grandchild", childId)] },
        actor,
        "main",
      ),
    ).rejects.toThrow("one level");
    const footer = await saveFooterNavigation(
      db,
      null,
      { ...value, items: [link(randomUUID(), "Footer")] },
      actor,
    );
    groups.push(footer.id);
    await expect(
      saveFooterNavigation(db, main.id, { ...value, items: footer.items }, actor, "main"),
    ).rejects.toThrow("belong");
    await expect(deleteFooterNavigation(db, main.id, actor)).rejects.toThrow("does not exist");
    // Reparent before deleting: the self-FK must not cascade over a retained child.
    const promoted = await saveFooterNavigation(
      db,
      main.id,
      { ...value, items: [link(childId, "Promoted")] },
      actor,
      "main",
    );
    expect(promoted.items.map((item) => item.id)).toEqual([childId]);
  });
  it("resolves current entry and topic paths and preserves deleted targets as broken dashboard rows", async () => {
    const db = await testDatabase();
    const [entry] = await db.insert(entries).values({ kind: "page" }).returning();
    const [topic] = await db.insert(topics).values({}).returning();
    if (!entry || !topic) throw new Error("Missing own fixture targets");
    targetEntries.push(entry.id);
    targetTopics.push(topic.id);
    const common = {
      label: { en: "Reference", de: "Referenz" },
      visible: { en: true, de: true },
      parentId: null,
      href: null,
    };
    const group = await saveFooterNavigation(
      db,
      null,
      {
        title: { en: "References", de: "Referenzen" },
        sortOrder: 0,
        items: [
          { ...common, entryId: entry.id, topicId: null },
          { ...common, entryId: null, topicId: topic.id },
        ],
      },
      actor,
      "main",
    );
    groups.push(group.id);
    const currentTopics = [{ id: topic.id, translations: { en: { slug: "new-topic" }, de: null } }];
    for (const path of ["/old-page/", "/new-page/"]) {
      const result = await readPublicNavigation(
        db,
        [{ entryId: entry.id, language: "en", path }],
        currentTopics,
        "main",
      );
      expect(result.en.find((row) => row.title === "References")?.items.map((item) => item.href)).toEqual([
        path,
        "/topics/new-topic/",
      ]);
    }
    await db.delete(entries).where(eq(entries.id, entry.id));
    await db.delete(topics).where(eq(topics.id, topic.id));
    const stored = (await listFooterNavigations(db, "main")).find((row) => row.id === group.id);
    expect(stored?.items).toHaveLength(2);
    expect(stored?.items.every((item) => !item.entryId && !item.topicId && !item.href)).toBe(true);
    expect(
      (await readPublicNavigation(db, [], [], "main")).en.find((row) => row.title === "References")?.items,
    ).toEqual([]);
  });
});
