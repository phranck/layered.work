import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  closeTestDatabase,
  emptyTestDatabase,
  hasTestDatabase,
  testDatabase,
} from "../test-support/database.js";
import { importContent, type Snapshot } from "./import-content.js";
import { entries, entryTopics, entryTranslations, media, paths, topics } from "./schema/index.js";

/**
 * The import, against the real snapshot and a real database.
 *
 * A fixture would prove the code runs. What has to be proved is that this
 * snapshot fits this schema, and the two were written months apart by different
 * steps, so the only honest subject is the file the site actually publishes.
 */

const runs = hasTestDatabase ? describe : describe.skip;

const snapshot = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../website/content/site.json", import.meta.url)), "utf8"),
) as Snapshot;

runs("importing a snapshot", () => {
  beforeAll(async () => {
    await emptyTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("writes every entry, its translations, its addresses and its topics", async () => {
    const database = await testDatabase();

    const report = await importContent(database, snapshot);

    // A pair of entries pointing at each other is one piece of writing, so the
    // entry rows are fewer than the snapshot's entries by the number of pairs.
    const pairs = snapshot.entries.filter((entry) => entry.translationPath).length / 2;
    expect(report.translations).toBe(snapshot.entries.length);
    expect(report.entries).toBe(snapshot.entries.length - pairs);
    expect(report.topics).toBe(snapshot.topics.length);

    expect(await database.select().from(entries)).toHaveLength(report.entries);
    expect(await database.select().from(entryTranslations)).toHaveLength(snapshot.entries.length);
    expect(await database.select().from(topics)).toHaveLength(snapshot.topics.length);

    // Every address the site answers at, plus every address it redirects from.
    expect(await database.select().from(paths)).toHaveLength(
      snapshot.entries.length + snapshot.redirects.length,
    );

    const assignments = snapshot.entries.reduce((total, entry) => total + entry.topics.length, 0);
    expect((await database.select().from(entryTopics)).length).toBeLessThanOrEqual(assignments);
  });

  it("gives a translation the state the snapshot gave it", async () => {
    const database = await testDatabase();
    await importContent(database, snapshot);

    for (const wanted of ["public", "hidden"] as const) {
      const source = snapshot.entries.find((entry) => entry.visibility === wanted);
      if (!source) continue;
      const [row] = await database
        .select({ state: entryTranslations.state, title: entryTranslations.title })
        .from(paths)
        .innerJoin(entryTranslations, eq(entryTranslations.id, paths.translationId))
        .where(and(eq(paths.path, source.path), eq(paths.isCurrent, true)));
      expect(row?.state, `${source.slug} should be ${wanted}`).toBe(wanted);
      expect(row?.title).toBe(source.title);
    }
  });

  it("holds a file once however many slugs name it", async () => {
    const database = await testDatabase();
    const report = await importContent(database, snapshot);

    const distinctFiles = new Set(snapshot.media.map((asset) => asset.sha256)).size;
    const rows = await database.select({ checksum: media.checksum }).from(media);
    expect(new Set(rows.map((row) => row.checksum)).size).toBe(rows.length);
    expect(rows.length + report.skipped.length).toBeLessThanOrEqual(distinctFiles);
    expect(report.aliased.length).toBe(snapshot.media.length - distinctFiles);
  });

  it("changes nothing the second time it runs", async () => {
    const database = await testDatabase();
    await importContent(database, snapshot);
    const before = {
      entries: (await database.select().from(entries)).length,
      translations: (await database.select().from(entryTranslations)).length,
      paths: (await database.select().from(paths)).length,
      media: (await database.select().from(media)).length,
      topics: (await database.select().from(topics)).length,
    };

    await importContent(database, snapshot);

    expect({
      entries: (await database.select().from(entries)).length,
      translations: (await database.select().from(entryTranslations)).length,
      paths: (await database.select().from(paths)).length,
      media: (await database.select().from(media)).length,
      topics: (await database.select().from(topics)).length,
    }).toEqual(before);
  });
});
