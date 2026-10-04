import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  entries,
  entryTopics,
  entryTranslations,
  formerTopicSlugs,
  media,
  mediaVariants,
  paths,
  topics,
  topicTranslations,
} from "../db/schema/index.js";
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

  it("publishes topic ids and both language addresses, including former slugs", async () => {
    const database = await testDatabase();
    const [topic] = await database.insert(topics).values({}).returning({ id: topics.id });
    if (!topic) throw new Error("no topic");
    await database.insert(topicTranslations).values([
      { topicId: topic.id, language: "en", name: "Hardware", slug: "hardware" },
      { topicId: topic.id, language: "de", name: "Elektronik", slug: "elektronik" },
    ]);
    await database.insert(formerTopicSlugs).values([
      { topicId: topic.id, language: "en", slug: "old-hardware" },
      { topicId: topic.id, language: "de", slug: "alte-elektronik" },
    ]);
    const { entryId } = await writeEntry(database, {
      title: "A machine",
      path: "/machine/",
      state: "public",
    });
    await database.insert(entryTopics).values({ entryId, topicId: topic.id });

    const snapshot = await readPublicSnapshot(database);

    expect(snapshot.topics).toEqual([
      {
        id: topic.id,
        translations: {
          en: { name: "Hardware", slug: "hardware" },
          de: { name: "Elektronik", slug: "elektronik" },
        },
      },
    ]);
    expect(snapshot.entries[0]?.topics).toEqual([topic.id]);
    expect(snapshot.redirects).toEqual(
      expect.arrayContaining([
        { source: "/topics/old-hardware/", target: "/topics/hardware/" },
        { source: "/de/topics/old-hardware/", target: "/de/topics/elektronik/" },
        { source: "/de/topics/alte-elektronik/", target: "/de/topics/elektronik/" },
        { source: "/de/topics/hardware/", target: "/de/topics/elektronik/" },
      ]),
    );
    expect(snapshot.redirects).toHaveLength(4);
  });

  it("keeps the English topic as the German fallback when no translation exists", async () => {
    const database = await testDatabase();
    const [topic] = await database.insert(topics).values({}).returning({ id: topics.id });
    if (!topic) throw new Error("no topic");
    await database.insert(topicTranslations).values({
      topicId: topic.id,
      language: "en",
      name: "Hardware",
      slug: "hardware",
    });
    await database.insert(formerTopicSlugs).values({
      topicId: topic.id,
      language: "en",
      slug: "old-hardware",
    });

    const snapshot = await readPublicSnapshot(database);

    expect(snapshot.topics[0]?.translations.de).toBeNull();
    expect(snapshot.redirects).toEqual(
      expect.arrayContaining([
        { source: "/topics/old-hardware/", target: "/topics/hardware/" },
        { source: "/de/topics/old-hardware/", target: "/de/topics/hardware/" },
      ]),
    );
  });

  it("carries a German-only topic instead of dropping it", async () => {
    const database = await testDatabase();
    const [topic] = await database.insert(topics).values({}).returning({ id: topics.id });
    if (!topic) throw new Error("no topic");
    await database.insert(topicTranslations).values({
      topicId: topic.id,
      language: "de",
      name: "Elektronik",
      slug: "elektronik",
    });

    const snapshot = await readPublicSnapshot(database);

    expect(snapshot.topics).toEqual([
      { id: topic.id, translations: { en: null, de: { name: "Elektronik", slug: "elektronik" } } },
    ]);
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

  it("offers no other language whilst that language is still a draft", async () => {
    const database = await testDatabase();
    const { entryId } = await writeEntry(database, {
      title: "In English",
      path: "/english/",
      state: "public",
    });
    const [german] = await database
      .insert(entryTranslations)
      .values({ entryId, language: "de", title: "Noch nicht fertig", body: "", state: "draft" })
      .returning({ id: entryTranslations.id });
    if (!german) throw new Error("no translation");
    await database.insert(paths).values({ translationId: german.id, path: "/de/noch-nicht/" });

    const snapshot = await readPublicSnapshot(database);

    expect(snapshot.entries.map((entry) => entry.translationPath)).toEqual([null]);
    expect(JSON.stringify(snapshot)).not.toContain("/de/noch-nicht/");
  });

  it("carries only the files published content names, however it names them", async () => {
    const database = await testDatabase();
    const files = await database
      .insert(media)
      .values(
        ["cover", "in-a-component", "linked", "only-in-a-draft", "unused-upload"].map((slug, index) => ({
          slug,
          kind: "image" as const,
          mimeType: "image/png",
          storageKey: slug === "unused-upload" ? "uploads/AbCdEf123" : `media/${slug}.png`,
          byteSize: 10,
          checksum: String(index).repeat(64),
          width: 10,
          height: 10,
        })),
      )
      .returning({ id: media.id, slug: media.slug });
    const cover = files.find((file) => file.slug === "cover")?.id;
    const { translationId } = await writeEntry(database, {
      title: "Names three files",
      path: "/three/",
      state: "public",
      body: 'Image("in-a-component")\n\nThe [sheet](/media/linked.png) as a file.',
    });
    await database
      .update(entryTranslations)
      .set({ featuredMediaId: cover })
      .where(eq(entryTranslations.id, translationId));
    await writeEntry(database, {
      title: "Not finished",
      path: "/not-finished/",
      state: "draft",
      body: 'Image("only-in-a-draft")',
    });

    const snapshot = await readPublicSnapshot(database);

    expect(snapshot.media.map((asset) => asset.slug).sort()).toEqual(["cover", "in-a-component", "linked"]);
    expect(JSON.stringify(snapshot)).not.toContain("uploads/");
    expect(JSON.stringify(snapshot)).not.toContain("only-in-a-draft");
  });

  it("gives a published image the responsive sizes stored for it", async () => {
    const database = await testDatabase();
    const [picture] = await database
      .insert(media)
      .values({
        slug: "responsive-cover",
        kind: "image",
        mimeType: "image/jpeg",
        storageKey: "migration/responsive-cover.jpg",
        byteSize: 5000,
        checksum: "a".repeat(64),
        width: 1200,
        height: 600,
      })
      .returning({ id: media.id });
    if (!picture) throw new Error("no picture");
    await database.insert(mediaVariants).values({
      mediaId: picture.id,
      format: "webp",
      width: 480,
      height: 240,
      byteSize: 900,
      storageKey: "migration/responsive-cover-variant-480.webp",
    });
    const { translationId } = await writeEntry(database, {
      title: "A cover",
      path: "/cover/",
      state: "public",
    });
    await database
      .update(entryTranslations)
      .set({ featuredMediaId: picture.id })
      .where(eq(entryTranslations.id, translationId));

    const snapshot = await readPublicSnapshot(database);
    expect(snapshot.media.find((asset) => asset.slug === "responsive-cover")?.srcSet).toBe(
      "/migration/responsive-cover-variant-480.webp 480w",
    );
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
