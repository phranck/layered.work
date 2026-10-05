import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { publicMedia } from "../content/snapshot.js";
import { media, mediaTranslations } from "../db/schema/index.js";
import { closeTestDatabase, hasTestDatabase, testDatabase } from "../test-support/database.js";
import { getMediaDetail, listMedia, saveMediaMetadata } from "./library.js";

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
    const byAlt = await listMedia(db, { search: `${prefix} mountains`, kind: "all", page: 1 });
    expect(byAlt.items.map((item) => item.id)).toEqual([ids[0]]);
    expect((await listMedia(db, { search: `${prefix} sunset`, kind: "all", page: 1 })).items[0]?.width).toBe(
      400,
    );
    expect(
      (await listMedia(db, { search: prefix, kind: "document", page: 1 })).items.map((item) => item.id),
    ).toEqual([ids[1]]);
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
});
