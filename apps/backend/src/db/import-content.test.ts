import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { mediaReferences } from "@layered/content";
import { LISTING_PATHS, listingSettings } from "@layered/schemas";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  closeTestDatabase,
  emptyTestDatabase,
  hasTestDatabase,
  testDatabase,
} from "../test-support/database.js";
import {
  importContent,
  isPubliiSizeCopy,
  migratedStorageKey,
  type Snapshot,
  withDrafts,
} from "./import-content.js";
import {
  entries,
  entryTopics,
  entryTranslations,
  media,
  mediaVariants,
  paths,
  settings,
  topics,
} from "./schema/index.js";

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

/** The snapshot's pages at an overview's address, which become introductions rather than entries. */
const overviewPages = snapshot.entries.filter(
  (entry) =>
    entry.kind === "page" && Object.values(LISTING_PATHS).some((path) => path[entry.language] === entry.path),
);

/**
 * A fuller snapshot standing in for the migration output, which never leaves
 * the machine that produced it. One published entry carries a stale body, as
 * the migration output does after an editorial correction, and two entries
 * exist only here: a draft and one in the trash.
 */
function migrationOutput(): Snapshot {
  const [first, ...rest] = snapshot.entries;
  if (!first) throw new Error("The published snapshot holds no entries");
  return {
    ...snapshot,
    entries: [
      { ...first, body: "The text before the correction." },
      ...rest,
      { ...first, id: "draft-fixture", slug: "draft-fixture", path: "/draft-fixture/", visibility: "draft" },
      {
        ...first,
        id: "trash-fixture",
        slug: "trash-fixture",
        path: "/trash-fixture/",
        visibility: "trashed",
      },
    ],
  };
}

// The upload in scripts/publii holds the same key in its own test. That script
// stays on the machine that ran the migration, so the two sides meet at this
// literal rather than through an import.
describe("the storage key of a migrated file", () => {
  it("is the key the upload gave its object in the bucket", () => {
    expect(migratedStorageKey("/media/cover.webp")).toBe("migration/cover.webp");
  });
});

describe("taking the drafts from the migration output", () => {
  it("adds the drafts and nothing else", () => {
    const merged = withDrafts(snapshot, migrationOutput());

    expect(merged.entries).toHaveLength(snapshot.entries.length + 1);
    expect(merged.entries.at(-1)?.path).toBe("/draft-fixture/");
    expect(merged.entries.some((entry) => entry.visibility === "trashed")).toBe(false);
  });

  it("keeps the published text where both files hold an entry", () => {
    const merged = withDrafts(snapshot, migrationOutput());

    expect(merged.entries[0]?.body).toBe(snapshot.entries[0]?.body);
  });
});

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

    // A page at an overview's address becomes that overview's introduction, so
    // it is no entry. A pair of entries pointing at each other is one piece of
    // writing, so the entry rows are fewer than the rest by the number of pairs.
    const written = snapshot.entries.filter((entry) => !overviewPages.includes(entry));
    const pairs = written.filter((entry) => entry.translationPath).length / 2;
    expect(report.translations).toBe(written.length);
    expect(report.entries).toBe(written.length - pairs);
    expect(report.topics).toBe(snapshot.topics.length);

    expect(await database.select().from(entries)).toHaveLength(report.entries);
    expect(await database.select().from(entryTranslations)).toHaveLength(written.length);
    expect(await database.select().from(topics)).toHaveLength(snapshot.topics.length);

    // Every address the site answers at, plus every address it redirects from.
    const writtenPaths = new Set(written.map((entry) => entry.path));
    expect(await database.select().from(paths)).toHaveLength(
      written.length + snapshot.redirects.filter((redirect) => writtenPaths.has(redirect.target)).length,
    );

    const assignments = snapshot.entries.reduce((total, entry) => total + entry.topics.length, 0);
    expect((await database.select().from(entryTopics)).length).toBeLessThanOrEqual(assignments);
  });

  it("gives a translation the state the snapshot gave it", async () => {
    const database = await testDatabase();
    const merged = withDrafts(snapshot, migrationOutput());
    await importContent(database, merged);

    for (const wanted of ["public", "hidden", "draft"] as const) {
      const source = merged.entries.find((entry) => entry.visibility === wanted);
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

  it("leaves no body naming a file the library does not hold", async () => {
    const database = await testDatabase();
    await importContent(database, snapshot);

    // Publii copied files between post directories and the migration gave each
    // copy a slug. The library holds the file once, so a body naming a second
    // copy has to name the one that was kept.
    const slugs = new Set((await database.select({ slug: media.slug }).from(media)).map((row) => row.slug));
    const bodies = await database.select({ body: entryTranslations.body }).from(entryTranslations);
    const unresolved = bodies
      .flatMap((row) => mediaReferences(row.body))
      .map((reference) => reference.slug)
      .filter((slug) => !slugs.has(slug));

    expect(unresolved).toEqual([]);
  });

  it("leaves Publii's size copies out of the library", async () => {
    const database = await testDatabase();
    await importContent(database, snapshot);

    // The responsive copies and gallery thumbnails Publii made of every picture
    // are superseded by the variants this site generates, and nothing names them.
    const copies = new Set(
      snapshot.media.filter((asset) => isPubliiSizeCopy(asset.source)).map((asset) => asset.slug),
    );
    expect(copies.size).toBeGreaterThan(0);
    const slugs = (await database.select({ slug: media.slug }).from(media)).map((row) => row.slug);
    expect(slugs.filter((slug) => copies.has(slug))).toEqual([]);
  });

  it("imports measured responsive variants and does not duplicate them on a second run", async () => {
    const root = await mkdtemp(join(tmpdir(), "layered-variants-"));
    try {
      await mkdir(join(root, "media"));
      const bytes = await sharp({
        create: { width: 480, height: 240, channels: 3, background: "#334455" },
      })
        .webp()
        .toBuffer();
      await writeFile(join(root, "media", "variant-fixture-variant-480.webp"), bytes);
      const original = Buffer.from("variant fixture original");
      const fixture: Snapshot = {
        entries: [],
        topics: [],
        redirects: [],
        media: [
          {
            slug: "variant-fixture",
            src: "/media/variant-fixture.jpg",
            mime: "image/jpeg",
            filename: "variant-fixture.jpg",
            source: "fixture/variant-fixture.jpg",
            bytes: original.length,
            sha256: createHash("sha256").update(original).digest("hex"),
            width: 1200,
            height: 600,
            srcSet: "/media/variant-fixture-variant-480.webp 480w",
          },
        ],
      };
      const database = await testDatabase();
      const report = await importContent(database, fixture, { variantRoot: root });
      expect(report.variants).toBe(1);
      const [variant] = await database.select().from(mediaVariants);
      expect(variant).toMatchObject({
        format: "webp",
        width: 480,
        height: 240,
        byteSize: bytes.length,
        storageKey: "migration/variant-fixture-variant-480.webp",
      });

      await importContent(database, fixture, { variantRoot: root });
      expect(await database.select().from(mediaVariants)).toHaveLength(1);

      const originalAsset = fixture.media[0];
      if (!originalAsset) throw new Error("No fixture picture.");
      const missing: Snapshot = {
        ...fixture,
        media: [
          {
            ...originalAsset,
            slug: "missing-variant-fixture",
            sha256: createHash("sha256").update("another original").digest("hex"),
            srcSet: "/media/absent-variant-480.webp 480w",
          },
        ],
      };
      await expect(importContent(database, missing, { variantRoot: root })).rejects.toThrow();
      expect(await database.select().from(media).where(eq(media.slug, "missing-variant-fixture"))).toEqual(
        [],
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("holds a file once however many slugs name it", async () => {
    const database = await testDatabase();
    const report = await importContent(database, snapshot);

    // Publii's size copies never reach the library, so the count is over the rest.
    const kept = snapshot.media.filter((asset) => !isPubliiSizeCopy(asset.source));
    const distinctFiles = new Set(kept.map((asset) => asset.sha256)).size;
    const rows = await database.select({ checksum: media.checksum }).from(media);
    expect(new Set(rows.map((row) => row.checksum)).size).toBe(rows.length);
    expect(rows.length).toBeLessThanOrEqual(distinctFiles);
    expect(report.aliased.length).toBe(kept.length - distinctFiles);
  });

  it("writes a page at an overview's address as that overview's introduction, and keeps one written since", async () => {
    const database = await testDatabase();
    const projectsPage = overviewPages.find((entry) => entry.path === "/projects/");
    expect(projectsPage, "the published snapshot holds the old projects page").toBeDefined();
    await importContent(database, snapshot);

    const stored = async () =>
      listingSettings.parse(
        (await database.select().from(settings).where(eq(settings.key, "projectListing")))[0]?.value,
      );
    expect((await stored()).introduction.en).toBe(projectsPage?.body.trim());
    expect(await database.select().from(paths).where(eq(paths.path, "/projects/"))).toEqual([]);

    const written = { ...(await stored()), introduction: { en: "Written in the dashboard.", de: "" } };
    await database.update(settings).set({ value: written }).where(eq(settings.key, "projectListing"));
    await importContent(database, snapshot);
    expect((await stored()).introduction.en).toBe("Written in the dashboard.");
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
