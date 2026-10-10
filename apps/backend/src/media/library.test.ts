import { randomUUID } from "node:crypto";
import { DEFAULT_LISTING } from "@layered/schemas";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { publicMedia } from "../content/snapshot.js";
import {
  entries,
  entryTranslations,
  homeBlocks,
  media,
  mediaJobs,
  mediaReferences,
  mediaTranslations,
  settingMediaReferences,
  settings,
  users,
} from "../db/schema/index.js";
import { closeTestDatabase, hasTestDatabase, testDatabase } from "../test-support/database.js";
import { getMediaDetail, getMediaUses, listMedia, saveMediaMetadata } from "./library.js";

const ids = [randomUUID(), randomUUID()];
const prefix = `library-${randomUUID()}`;
(hasTestDatabase ? describe : describe.skip)("media library readers and metadata", () => {
  afterAll(async () => {
    const db = await testDatabase();
    await db.delete(media).where(inArray(media.id, ids));
    await closeTestDatabase();
  });
  beforeAll(async () => {
    const db = await testDatabase();
    await db.insert(media).values(
      ids.map((id, index) => ({
        id,
        slug: `${prefix}-${index}`,
        kind: index === 0 ? ("image" as const) : ("document" as const),
        mimeType: index === 0 ? "image/png" : "application/pdf",
        storageKey: `test/${id}`,
        checksum: id,
        byteSize: 123,
        width: index === 0 ? 400 : null,
        height: index === 0 ? 200 : null,
      })),
    );
    await db.insert(mediaTranslations).values({
      mediaId: ids[0] ?? "",
      language: "de",
      altText: `${prefix} mountains`,
      caption: `${prefix} sunset`,
    });
  });
  it("searches localized alt text and captions, and filters kinds without losing dimensions", async () => {
    const db = await testDatabase();
    const byAlt = await listMedia(db, { search: `${prefix} mountains`, kind: "all", page: 1, order: "slug" });
    expect(byAlt.items.map((item) => item.id)).toEqual([ids[0]]);
    expect(
      (await listMedia(db, { search: `${prefix} sunset`, kind: "all", page: 1, order: "slug" })).items[0]
        ?.width,
    ).toBe(400);
    expect(
      (await listMedia(db, { search: prefix, kind: "document", page: 1, order: "slug" })).items.map(
        (item) => item.id,
      ),
    ).toEqual([ids[1]]);
  });
  it("lists the newest file first when asked, and by slug otherwise", async () => {
    const db = await testDatabase();
    await db
      .update(media)
      .set({ uploadedAt: new Date(Date.now() + 60_000) })
      .where(eq(media.id, ids[1] ?? ""));
    const listed = async (order: "slug" | "newest") =>
      (await listMedia(db, { search: prefix, kind: "all", page: 1, order })).items.map((item) => item.id);
    expect(await listed("newest")).toEqual([ids[1], ids[0]]);
    expect(await listed("slug")).toEqual([ids[0], ids[1]]);
  });
  it("saves both languages and distinguishes missing alt text from an explicitly decorative image", async () => {
    const db = await testDatabase();
    const id = ids[0] ?? "";
    await saveMediaMetadata(db, id, {
      focalPoint: { x: 0.3, y: 0.7 },
      translations: [
        { language: "en", altText: "", caption: null },
        { language: "de", altText: null, caption: null },
      ],
    });
    const detail = await getMediaDetail(db, id);
    expect(detail.translations.en.altText).toBe("");
    expect(detail.translations.de.altText).toBeNull();
    expect(detail.focalPoint).toEqual({ x: 0.3, y: 0.7 });
    const published = (await publicMedia(db, [{ body: "", featuredMediaId: id }])).media[0];
    expect(published?.translations).toEqual({
      en: { altText: "", caption: null },
      de: { altText: null, caption: null },
    });
    const [row] = await db.select().from(media).where(eq(media.id, id));
    expect(row?.slug).toBe(`${prefix}-0`);
  });
  it("queues a picture again when its watermark moves, and leaves it alone when nothing about the mark changed", async () => {
    const db = await testDatabase();
    const id = ids[0] ?? "";
    const translations = [
      { language: "en" as const, altText: null, caption: null },
      { language: "de" as const, altText: null, caption: null },
    ];
    const state = async () =>
      (await db.select().from(mediaJobs).where(eq(mediaJobs.mediaId, id)))[0]?.state ?? "none";
    await db.delete(mediaJobs).where(eq(mediaJobs.mediaId, id));

    await saveMediaMetadata(db, id, { focalPoint: { x: 0.5, y: 0.5 }, translations });
    expect(await state()).toBe("none");

    const detail = await saveMediaMetadata(db, id, {
      focalPoint: { x: 0.5, y: 0.5 },
      translations,
      watermark: "top-right",
    });
    expect(detail.watermark).toBe("top-right");
    expect(await state()).toBe("queued");

    await db.update(mediaJobs).set({ state: "ready" }).where(eq(mediaJobs.mediaId, id));
    await saveMediaMetadata(db, id, { focalPoint: { x: 0.4, y: 0.5 }, translations });
    expect((await getMediaDetail(db, id)).watermark).toBe("top-right");
    expect(await state()).toBe("ready");

    await saveMediaMetadata(db, id, { focalPoint: { x: 0.4, y: 0.5 }, translations, watermark: null });
    expect(await state()).toBe("queued");
  });
  it("refuses a watermark on a file that is not a raster image", async () => {
    const db = await testDatabase();
    await expect(
      saveMediaMetadata(db, ids[1] ?? "", {
        focalPoint: { x: 0.5, y: 0.5 },
        translations: [
          { language: "en", altText: null, caption: null },
          { language: "de", altText: null, caption: null },
        ],
        watermark: "center",
      }),
    ).rejects.toThrow(/raster image/);
  });
  it("publishes files named only by an overview introduction", async () => {
    const db = await testDatabase();
    const snapshot = await publicMedia(db, [], [`Image("${prefix}-0")`]);
    expect(snapshot.media.map((asset) => asset.slug)).toEqual([`${prefix}-0`]);
  });

  // The detail screen lists a file's uses and the library's "unused" filter
  // hides them, from two queries that cannot be one, so this holds them together
  // for every kind of use there is.
  it("lists every use the unused filter counts, and none it does not", async () => {
    const db = await testDatabase();
    const created: string[] = [];
    const picture = async () => {
      const id = randomUUID();
      created.push(id);
      await db.insert(media).values({
        id,
        slug: `${prefix}-use-${id}`,
        kind: "image",
        mimeType: "image/png",
        storageKey: `test/${id}`,
        checksum: id,
        byteSize: 1,
        width: 10,
        height: 10,
      });
      return id;
    };
    const [entry] = await db.insert(entries).values({ kind: "post" }).returning({ id: entries.id });
    const [translation] = await db
      .insert(entryTranslations)
      .values({ entryId: entry?.id ?? "", language: "en", title: `${prefix} uses` })
      .returning({ id: entryTranslations.id });
    const translationId = translation?.id ?? "";
    const [storedSite] = await db.select().from(settings).where(eq(settings.key, "site"));
    const [storedListing] = await db.select().from(settings).where(eq(settings.key, "postListing"));
    const blockIds: string[] = [];
    const uses: Record<string, (id: string) => Promise<unknown>> = {
      cover: (id) =>
        db
          .update(entryTranslations)
          .set({ featuredMediaId: id })
          .where(eq(entryTranslations.id, translationId)),
      socialCard: (id) =>
        db
          .update(entryTranslations)
          .set({ socialCardMediaId: id })
          .where(eq(entryTranslations.id, translationId)),
      body: (id) => db.insert(mediaReferences).values({ translationId, mediaId: id }),
      portrait: (id) =>
        db.insert(users).values({
          email: `${prefix}-${id}@example.test`,
          passwordHash: "unused",
          displayName: "Portrait",
          role: "editor",
          avatarMediaId: id,
        }),
      sitePicture: (id) =>
        db
          .insert(settings)
          .values({ key: "site", value: { socialImageMediaId: id } })
          .onConflictDoUpdate({ target: settings.key, set: { value: { socialImageMediaId: id } } }),
      homeBlock: async (id) => {
        const [block] = await db
          .insert(homeBlocks)
          .values({ type: "hero", sortOrder: 99, settings: { picture: id } })
          .returning({ id: homeBlocks.id });
        if (block) blockIds.push(block.id);
      },
      introduction: async (id) => {
        await db
          .insert(settings)
          .values({ key: "postListing", value: DEFAULT_LISTING })
          .onConflictDoNothing();
        await db
          .insert(settingMediaReferences)
          .values({ settingsKey: "postListing", language: "en", mediaId: id });
      },
    };
    try {
      for (const [kind, use] of Object.entries(uses)) {
        const id = await picture();
        await use(id);
        const unused = await listMedia(db, {
          search: `${prefix}-use-${id}`,
          kind: "all",
          page: 1,
          order: "slug",
          unused: true,
        });
        expect({ kind, listed: (await getMediaUses(db, id)).length > 0 }).toEqual({ kind, listed: true });
        expect({ kind, unused: unused.items.length }).toEqual({ kind, unused: 0 });
      }
      const idle = await picture();
      expect(await getMediaUses(db, idle)).toEqual([]);
      const unused = await listMedia(db, {
        search: `${prefix}-use-${idle}`,
        kind: "all",
        page: 1,
        order: "slug",
        unused: true,
      });
      expect(unused.items.map((item) => item.id)).toEqual([idle]);
    } finally {
      if (blockIds.length) await db.delete(homeBlocks).where(inArray(homeBlocks.id, blockIds));
      await db.delete(users).where(inArray(users.avatarMediaId, created));
      if (storedSite)
        await db.update(settings).set({ value: storedSite.value }).where(eq(settings.key, "site"));
      else await db.delete(settings).where(eq(settings.key, "site"));
      await db.delete(settingMediaReferences).where(inArray(settingMediaReferences.mediaId, created));
      if (!storedListing) await db.delete(settings).where(eq(settings.key, "postListing"));
      await db.delete(entries).where(eq(entries.id, entry?.id ?? ""));
      await db.delete(media).where(inArray(media.id, created));
    }
  });
});
