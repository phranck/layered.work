import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  closeTestDatabase,
  emptyTestDatabase,
  hasTestDatabase,
  testDatabase,
} from "../test-support/database.js";
import { media, mediaVariants } from "./schema/index.js";
import { missingObjects, missingRenderedObjects } from "./verify-storage.js";

describe("checking rendered media keys", () => {
  it("checks each storage key once, including legacy files outside the library", async () => {
    const asked: string[] = [];
    const missing = await missingRenderedObjects(
      ["/migration/manual.pdf", "/migration/manual.pdf", "/uploads/new-image.webp"],
      async (key) => {
        asked.push(key);
        return key === "migration/manual.pdf";
      },
    );
    expect(asked.sort()).toEqual(["migration/manual.pdf", "uploads/new-image.webp"]);
    expect(missing).toEqual(["uploads/new-image.webp"]);
    await expect(missingRenderedObjects(["/media/legacy.pdf"], async () => true)).rejects.toThrow();
  });
});

const runs = hasTestDatabase ? describe : describe.skip;

runs("checking every storage key against the store", () => {
  beforeEach(async () => {
    await emptyTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("lists the files whose key names no object, and only those", async () => {
    const database = await testDatabase();
    await database.insert(media).values(
      ["present", "absent"].map((slug, index) => ({
        slug,
        kind: "document" as const,
        mimeType: "application/pdf",
        storageKey: `migration/${slug}.pdf`,
        byteSize: 10,
        checksum: String(index).repeat(64),
      })),
    );

    const asked: string[] = [];
    const missing = await missingObjects(database, async (key) => {
      asked.push(key);
      return key === "migration/present.pdf";
    });

    expect(missing).toEqual([
      {
        slug: "absent",
        storageKey: "migration/absent.pdf",
        mimeType: "application/pdf",
        byteSize: 10,
        checksum: "1".repeat(64),
      },
    ]);
    expect(asked.sort()).toEqual(["migration/absent.pdf", "migration/present.pdf"]);
  });

  it("reports a missing responsive variant even when its original exists", async () => {
    const database = await testDatabase();
    const [original] = await database
      .insert(media)
      .values({
        slug: "cover",
        kind: "image",
        mimeType: "image/jpeg",
        storageKey: "migration/cover.jpg",
        byteSize: 100,
        checksum: "a".repeat(64),
        width: 1200,
        height: 600,
      })
      .returning({ id: media.id });
    if (!original) throw new Error("No original image.");
    await database.insert(mediaVariants).values({
      mediaId: original.id,
      format: "webp",
      width: 480,
      height: 240,
      byteSize: 20,
      storageKey: "migration/cover-480.webp",
    });

    const asked: string[] = [];
    const missing = await missingObjects(database, async (key) => {
      asked.push(key);
      return key === "migration/cover.jpg";
    });

    expect(missing.map(({ slug, storageKey }) => ({ slug, storageKey }))).toEqual([
      { slug: "cover@480w", storageKey: "migration/cover-480.webp" },
    ]);
    expect(asked.sort()).toEqual(["migration/cover-480.webp", "migration/cover.jpg"]);
  });
});
