import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { entries, entryTranslations, paths } from "../db/schema/index.js";
import {
  closeTestDatabase,
  emptyTestDatabase,
  hasTestDatabase,
  testDatabase,
} from "../test-support/database.js";
import { readPublicSnapshot } from "./snapshot.js";

/**
 * What may leave the database towards the public site.
 *
 * The question these ask is not whether the shape is right, which a type
 * already says, but whether anything unpublished can be read through it. Every
 * one of them writes a draft and then looks for it.
 */

const runs = hasTestDatabase ? describe : describe.skip;

/** Writes one entry with one translation at one address. */
async function writeEntry(
  database: Awaited<ReturnType<typeof testDatabase>>,
  options: { title: string; path: string; state: "public" | "draft" | "hidden"; body?: string },
) {
  const [entry] = await database.insert(entries).values({ kind: "post" }).returning({ id: entries.id });
  if (!entry) throw new Error("no entry");
  const [translation] = await database
    .insert(entryTranslations)
    .values({
      entryId: entry.id,
      language: "en",
      title: options.title,
      body: options.body ?? "",
      state: options.state,
    })
    .returning({ id: entryTranslations.id });
  if (!translation) throw new Error("no translation");
  await database.insert(paths).values({ translationId: translation.id, path: options.path });
  return { entryId: entry.id, translationId: translation.id };
}

runs("the public snapshot", () => {
  beforeEach(async () => {
    await emptyTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("carries a public entry", async () => {
    const database = await testDatabase();
    await writeEntry(database, { title: "Out in the open", path: "/open/", state: "public" });

    const snapshot = await readPublicSnapshot(database);

    expect(snapshot.entries.map((entry) => entry.path)).toEqual(["/open/"]);
    expect(snapshot.entries[0]?.visibility).toBe("public");
    expect(snapshot.entries[0]?.slug).toBe("open");
  });

  it("carries a hidden entry, because it answers at its own address", async () => {
    const database = await testDatabase();
    await writeEntry(database, { title: "Reachable by address", path: "/quiet/", state: "hidden" });

    const snapshot = await readPublicSnapshot(database);

    expect(snapshot.entries.map((entry) => entry.visibility)).toEqual(["hidden"]);
  });

  it("carries no draft, and not one word of its body", async () => {
    const database = await testDatabase();
    await writeEntry(database, {
      title: "Not finished",
      path: "/unfinished/",
      state: "draft",
      body: "A sentence nobody outside may read.",
    });

    const snapshot = await readPublicSnapshot(database);

    expect(snapshot.entries).toEqual([]);
    expect(JSON.stringify(snapshot)).not.toContain("Not finished");
    expect(JSON.stringify(snapshot)).not.toContain("nobody outside may read");
  });

  it("leaves a draft out whilst its published sibling stays in", async () => {
    const database = await testDatabase();
    await writeEntry(database, { title: "Published", path: "/published/", state: "public" });
    await writeEntry(database, { title: "Draft", path: "/draft/", state: "draft" });

    const snapshot = await readPublicSnapshot(database);

    expect(snapshot.entries.map((entry) => entry.title)).toEqual(["Published"]);
  });

  it("turns a former address into a redirect to the current one", async () => {
    const database = await testDatabase();
    const { translationId } = await writeEntry(database, {
      title: "Moved",
      path: "/now/",
      state: "public",
    });
    await database.insert(paths).values({ translationId, path: "/before/", isCurrent: false });

    const snapshot = await readPublicSnapshot(database);

    expect(snapshot.redirects).toEqual([{ source: "/before/", target: "/now/" }]);
  });

  it("does not offer a former address of a draft", async () => {
    const database = await testDatabase();
    const { translationId } = await writeEntry(database, {
      title: "Unfinished and moved",
      path: "/draft-now/",
      state: "draft",
    });
    await database.insert(paths).values({ translationId, path: "/draft-before/", isCurrent: false });

    const snapshot = await readPublicSnapshot(database);

    expect(snapshot.redirects).toEqual([]);
  });

  it("pairs two translations of one entry", async () => {
    const database = await testDatabase();
    const [entry] = await database.insert(entries).values({ kind: "post" }).returning({ id: entries.id });
    if (!entry) throw new Error("no entry");
    for (const [language, title, path] of [
      ["en", "In English", "/english/"],
      ["de", "Auf Deutsch", "/de/deutsch/"],
    ] as const) {
      const [translation] = await database
        .insert(entryTranslations)
        .values({ entryId: entry.id, language, title, body: "", state: "public" })
        .returning({ id: entryTranslations.id });
      if (!translation) throw new Error("no translation");
      await database.insert(paths).values({ translationId: translation.id, path });
    }

    const snapshot = await readPublicSnapshot(database);

    const english = snapshot.entries.find((item) => item.language === "en");
    const german = snapshot.entries.find((item) => item.language === "de");
    expect(english?.translationPath).toBe("/de/deutsch/");
    expect(german?.translationPath).toBe("/english/");
  });

  it("leaves out a translation nothing can link to", async () => {
    const database = await testDatabase();
    const { translationId } = await writeEntry(database, {
      title: "Addressless",
      path: "/temporary/",
      state: "public",
    });
    await database.delete(paths).where(eq(paths.translationId, translationId));

    const snapshot = await readPublicSnapshot(database);

    expect(snapshot.entries).toEqual([]);
  });
});
