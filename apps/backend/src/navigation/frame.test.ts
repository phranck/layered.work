import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, expect, it } from "vitest";
import { readPublicSnapshot } from "../content/snapshot.js";
import {
  navigationItems,
  navigationItemTranslations,
  navigations,
  navigationTranslations,
  socialAccounts,
} from "../db/schema/index.js";
import { closeTestDatabase, hasTestDatabase, testDatabase } from "../test-support/database.js";

const id = randomUUID();
const socialId = randomUUID();
afterAll(async () => {
  if (!hasTestDatabase) return;
  const db = await testDatabase();
  await db.delete(navigations).where(eq(navigations.id, id));
  await db.delete(socialAccounts).where(eq(socialAccounts.id, socialId));
  await closeTestDatabase();
});
it.skipIf(!hasTestDatabase)(
  "publishes the main navigation and enabled social accounts with public site settings",
  async () => {
    const db = await testDatabase();
    await db.insert(navigations).values({ id, placement: "main" });
    await db.insert(navigationTranslations).values([
      { navigationId: id, language: "en", title: "Main" },
      { navigationId: id, language: "de", title: "Haupt" },
    ]);
    const [item] = await db
      .insert(navigationItems)
      .values({ navigationId: id, href: `https://example.test/${id}` })
      .returning({ id: navigationItems.id });
    if (!item) throw new Error("Missing own navigation item");
    await db.insert(navigationItemTranslations).values([
      { itemId: item.id, language: "en", label: "Stored main", visible: true },
      { itemId: item.id, language: "de", label: "Gespeichert", visible: true },
    ]);
    await db.insert(socialAccounts).values({
      id: socialId,
      platform: "github",
      handle: "Fixture",
      href: `https://example.test/${socialId}`,
    });
    const snapshot = await readPublicSnapshot(db);
    expect(snapshot).toHaveProperty("mainNavigation");
    expect(snapshot).toHaveProperty("siteFrame");
    expect(snapshot.mainNavigation.en).toContainEqual({
      label: "Stored main",
      href: `https://example.test/${id}`,
    });
    expect(snapshot.mainNavigation.de).toContainEqual({
      label: "Gespeichert",
      href: `https://example.test/${id}`,
    });
    expect(snapshot.siteFrame.social).toContainEqual({
      platform: "github",
      handle: "Fixture",
      href: `https://example.test/${socialId}`,
    });
    expect(Object.keys(snapshot.siteFrame).sort()).toEqual(["footerLine", "social", "socialImage", "title"]);
    await db.update(socialAccounts).set({ enabled: false }).where(eq(socialAccounts.id, socialId));
    expect(
      (await readPublicSnapshot(db)).siteFrame.social.some((account) => account.href.endsWith(socialId)),
    ).toBe(false);
  },
);
