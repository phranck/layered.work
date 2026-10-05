import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, expect, it } from "vitest";
import { readPublicSnapshot } from "../content/snapshot.js";
import {
  navigationItems,
  navigationItemTranslations,
  navigations,
  navigationTranslations,
} from "../db/schema/index.js";
import { closeTestDatabase, hasTestDatabase, testDatabase } from "../test-support/database.js";

const id = randomUUID();
afterAll(async () => {
  if (hasTestDatabase) {
    const db = await testDatabase();
    await db.delete(navigations).where(eq(navigations.id, id));
    await closeTestDatabase();
  }
});
it.skipIf(!hasTestDatabase)(
  "publishes stored footer groups in both languages and drops invisible or broken links",
  async () => {
    const db = await testDatabase();
    await db.insert(navigations).values({ id, placement: "footer", sortOrder: 10 });
    await db.insert(navigationTranslations).values([
      { navigationId: id, language: "en", title: `Footer ${id}` },
      { navigationId: id, language: "de", title: `Fußzeile ${id}` },
    ]);
    const rows = await db
      .insert(navigationItems)
      .values([
        { navigationId: id, href: "https://example.test/two", sortOrder: 2 },
        { navigationId: id, href: "https://example.test/one", sortOrder: 1 },
        { navigationId: id, sortOrder: 0 },
      ])
      .returning({ id: navigationItems.id });
    for (const [index, row] of rows.entries())
      await db.insert(navigationItemTranslations).values([
        { itemId: row.id, language: "en", label: `EN ${index}`, visible: true },
        { itemId: row.id, language: "de", label: `DE ${index}`, visible: index !== 0 },
      ]);
    const snapshot = await readPublicSnapshot(db);
    expect(snapshot).toHaveProperty("footerNavigation");
    const footer = snapshot.footerNavigation;
    expect(footer.en.find((group) => group.title === `Footer ${id}`)?.items).toEqual([
      { label: "EN 1", href: "https://example.test/one" },
      { label: "EN 0", href: "https://example.test/two" },
    ]);
    expect(footer.de.find((group) => group.title === `Fußzeile ${id}`)?.items).toEqual([
      { label: "DE 1", href: "https://example.test/one" },
    ]);
  },
);
