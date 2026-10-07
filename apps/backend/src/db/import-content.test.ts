import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { mediaReferences } from "@layered/content";
import { DEFAULT_LISTING, LISTING_PATHS, listingSettings } from "@layered/schemas";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { selectObjects } from "../../../../scripts/publii/upload.mjs";
import {
  closeTestDatabase,
  emptyTestDatabase,
  hasTestDatabase,
  testDatabase,
} from "../test-support/database.js";
import {
  holdsEntries,
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
  gonePaths,
  media,
  mediaTranslations,
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
  const englishTopic = snapshot.topics.find((topic) => "translations" in topic && topic.translations.en);
  if (!englishTopic || !("translations" in englishTopic) || !englishTopic.translations.en) {
    throw new Error("The published snapshot holds no English topic");
  }
  return {
    ...snapshot,
    entries: [
      { ...first, body: "The text before the correction." },
      ...rest,
      {
        ...first,
        id: "draft-fixture",
        slug: "draft-fixture",
        path: "/draft-fixture/",
        visibility: "draft",
        topics: [englishTopic.translations.en.slug],
      },
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

describe("the storage key of a migrated file", () => {
  it("is the key the upload gave its object in the bucket", () => {
    const src = "/media/cover.webp";
    const { objects } = selectObjects(
      {
        entries: [{ body: 'Image("cover")' }],
        media: [
          {
            slug: "cover",
            src,
            source: "posts/1/cover.webp",
            filename: "cover.webp",
            mime: "image/webp",
            bytes: 100,
            sha256: "a".repeat(64),
          },
        ],
      },
      { variants: [] },
    );
    expect(objects).toHaveLength(1);
    expect(migratedStorageKey(src)).toBe(objects[0]?.key);
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
    // The responsive copies and gallery thumbnails Publii made of every picture
    // are superseded by the variants this site generates, and nothing names them.
    const copies = ["posts/1/responsive/hero-md.webp", "posts/1/gallery/plate-thumbnail.jpg"];
    const fixture: Snapshot = {
      entries: [],
      topics: [],
      redirects: [],
      media: copies.map((source, index) => ({
        slug: `size-copy-${index}`,
        src: `/media/${source.split("/").at(-1)}`,
        mime: "image/webp",
        filename: source.split("/").at(-1) ?? source,
        source,
        bytes: 10,
        sha256: String(index).repeat(64),
        width: 10,
        height: 10,
      })),
    };
    expect(fixture.media.every((asset) => isPubliiSizeCopy(asset.source))).toBe(true);

    const report = await importContent(database, fixture);

    expect(report.media).toBe(0);
    expect(await database.select().from(media).where(eq(media.slug, "size-copy-0"))).toEqual([]);
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
      const report = await importContent(database, fixture, { roots: { exported: root } });
      expect(report.variants).toBe(1);
      const [variant] = await database.select().from(mediaVariants);
      expect(variant).toMatchObject({
        format: "webp",
        width: 480,
        height: 240,
        byteSize: bytes.length,
        storageKey: "migration/variant-fixture-variant-480.webp",
      });

      await importContent(database, fixture, { roots: { exported: root } });
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
      await expect(importContent(database, missing, { roots: { exported: root } })).rejects.toThrow();
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
    await emptyTestDatabase();
    const database = await testDatabase();
    const example = snapshot.entries[0];
    if (!example) throw new Error("The published snapshot holds no entries");
    // How the migration output carries the text above the projects: as a page
    // at the overview's own address.
    const projectsPage = {
      ...example,
      id: "projects-page",
      slug: "projects",
      path: "/projects/",
      kind: "page" as const,
      language: "en" as const,
      body: "What the workshop builds.\n",
      translationPath: null,
    };
    const withPage: Snapshot = { entries: [projectsPage], topics: [], media: [], redirects: [] };
    await importContent(database, withPage);

    const stored = async () =>
      listingSettings.parse(
        (await database.select().from(settings).where(eq(settings.key, "projectListing")))[0]?.value,
      );
    expect((await stored()).introduction.en).toBe(projectsPage.body.trim());
    expect(await database.select().from(paths).where(eq(paths.path, "/projects/"))).toEqual([]);

    const written = { ...(await stored()), introduction: { en: "Written in the dashboard.", de: "" } };
    await database.update(settings).set({ value: written }).where(eq(settings.key, "projectListing"));
    await importContent(database, withPage);
    expect((await stored()).introduction.en).toBe("Written in the dashboard.");
  });

  it("reads a snapshot written from the database, which names its files by storage key", async () => {
    await emptyTestDatabase();
    const store = await mkdtemp(join(tmpdir(), "layered-store-"));
    try {
      await mkdir(join(store, "variants", "fixture"), { recursive: true });
      const bytes = await sharp({
        create: { width: 480, height: 320, channels: 3, background: "#556677" },
      })
        .webp()
        .toBuffer();
      await writeFile(join(store, "variants", "fixture", "small.webp"), bytes);
      const example = snapshot.entries[0];
      if (!example) throw new Error("The published snapshot holds no entries");
      const fixture: Snapshot = {
        entries: [
          {
            ...example,
            id: "stored-entry",
            slug: "stored-entry",
            path: "/stored-entry/",
            language: "en",
            translationPath: null,
            topics: [],
            featuredImage: "stored-picture",
            socialImage: "stored-picture",
            showInOtherLanguage: true,
          },
        ],
        topics: [],
        redirects: [],
        media: [
          {
            slug: "stored-picture",
            src: "/uploads/stored-picture-key",
            mime: "image/webp",
            filename: "stored-picture-key",
            source: "uploads/stored-picture-key",
            bytes: 10,
            sha256: "c".repeat(64),
            width: 960,
            height: 640,
            translations: {
              en: { altText: "A front plate", caption: null },
              de: { altText: "Eine Frontplatte", caption: "Gefräst" },
            },
            focalPoint: { x: 0.25, y: 0.75 },
            placeholder: "data:image/webp;base64,UklGRg==",
            srcSet: "/variants/fixture/small.webp 480w",
          },
        ],
        listings: {
          project: { ...DEFAULT_LISTING, introduction: { en: "Built here.", de: "Hier gebaut." } },
        },
        gone: ["/removed-entry/"],
      };
      const database = await testDatabase();

      await importContent(database, fixture, { roots: { exported: store, stored: store } });

      const [picture] = await database.select().from(media).where(eq(media.slug, "stored-picture"));
      if (!picture) throw new Error("The picture was not imported");
      expect(picture).toMatchObject({
        storageKey: "uploads/stored-picture-key",
        focalX: 0.25,
        focalY: 0.75,
        placeholder: "data:image/webp;base64,UklGRg==",
      });
      const descriptions = await database
        .select({ language: mediaTranslations.language, altText: mediaTranslations.altText })
        .from(mediaTranslations)
        .where(eq(mediaTranslations.mediaId, picture.id));
      expect(descriptions.map((row) => `${row.language} ${row.altText}`).sort()).toEqual([
        "de Eine Frontplatte",
        "en A front plate",
      ]);
      expect(
        await database
          .select({ storageKey: mediaVariants.storageKey, height: mediaVariants.height })
          .from(mediaVariants),
      ).toEqual([{ storageKey: "variants/fixture/small.webp", height: 320 }]);
      expect(await database.select().from(entryTranslations)).toEqual([
        expect.objectContaining({
          showInOtherLanguage: true,
          featuredMediaId: picture.id,
          socialCardMediaId: picture.id,
        }),
      ]);
      const [listing] = await database.select().from(settings).where(eq(settings.key, "projectListing"));
      expect(listingSettings.parse(listing?.value).introduction).toEqual({
        en: "Built here.",
        de: "Hier gebaut.",
      });
      expect(await database.select({ path: gonePaths.path }).from(gonePaths)).toEqual([
        { path: "/removed-entry/" },
      ]);
    } finally {
      await rm(store, { recursive: true, force: true });
    }
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

  it("keeps the earliest creation and latest modification of a translated entry on repeated import", async () => {
    const database = await testDatabase();
    const example = snapshot.entries[0];
    if (!example) throw new Error("The published snapshot holds no entries");
    const english = {
      ...example,
      id: "date-english",
      slug: "date-english",
      path: "/date-english/",
      language: "en" as const,
      createdAt: "2020-01-02T00:00:00.000Z",
      updatedAt: "2020-01-04T00:00:00.000Z",
      translationPath: "/de/date-german/",
      topics: [],
      featuredImage: null,
    };
    const german = {
      ...english,
      id: "date-german",
      slug: "date-german",
      path: "/de/date-german/",
      language: "de" as const,
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-05T00:00:00.000Z",
      translationPath: english.path,
    };
    const fixture: Snapshot = { entries: [english, german], topics: [], media: [], redirects: [] };
    const stored = async () => {
      const [row] = await database
        .select({ id: entries.id, createdAt: entries.createdAt, modifiedAt: entries.modifiedAt })
        .from(entries)
        .innerJoin(entryTranslations, eq(entryTranslations.entryId, entries.id))
        .innerJoin(paths, eq(paths.translationId, entryTranslations.id))
        .where(eq(paths.path, english.path));
      return row;
    };

    await importContent(database, fixture);
    const before = await stored();
    expect(before?.createdAt.toISOString()).toBe(german.createdAt);
    expect(before?.modifiedAt.toISOString()).toBe(german.updatedAt);

    await importContent(database, {
      ...fixture,
      entries: [
        { ...english, createdAt: "2019-01-02T00:00:00.000Z", updatedAt: "2021-01-04T00:00:00.000Z" },
        { ...german, createdAt: "2019-01-01T00:00:00.000Z", updatedAt: "2021-01-05T00:00:00.000Z" },
      ],
    });
    const after = await stored();
    expect(after?.id).toBe(before?.id);
    expect(after?.createdAt.toISOString()).toBe("2019-01-01T00:00:00.000Z");
    expect(after?.modifiedAt.toISOString()).toBe("2021-01-05T00:00:00.000Z");
  });

  it("says whether a database already holds entries, which is what keeps the command out of one", async () => {
    await emptyTestDatabase();
    const database = await testDatabase();
    expect(await holdsEntries(database)).toBe(false);

    await importContent(database, snapshot);
    expect(await holdsEntries(database)).toBe(true);
  });
});
