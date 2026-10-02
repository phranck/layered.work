import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { media } from "../db/schema/index.js";
import {
  closeTestDatabase,
  emptyTestDatabase,
  hasTestDatabase,
  testDatabase,
} from "../test-support/database.js";
import { issueUploadToken } from "./upload-token.js";

/**
 * Checking what arrived for an upload, with real pictures decoded by sharp and
 * a real database. Only the store is replaced, by a map of key to bytes, so a
 * test decides exactly what "arrived".
 */

const stored = vi.hoisted(() => new Map<string, Buffer>());
const removed = vi.hoisted(() => [] as string[]);

vi.mock("./storage.js", () => ({
  readMediaBytes: async (key: string) => {
    const bytes = stored.get(key);
    if (!bytes) throw new Error("no such object");
    return bytes;
  },
  deleteMediaObject: async (key: string) => {
    removed.push(key);
    stored.delete(key);
  },
  uploadTarget: async () => ({ url: "/media/uploads/token/content", headers: {} }),
}));

const { completeUpload, slugStem } = await import("./upload.js");

const runs = hasTestDatabase ? describe : describe.skip;

const AUTHOR = "00000000-0000-4000-8000-000000000001";

let sequence = 0;

/** A picture of the given type, different from every other this suite makes. */
async function picture(format: "png" | "jpeg", width = 40, height = 30): Promise<Buffer> {
  sequence += 1;
  return sharp({
    create: { width, height, channels: 3, background: { r: sequence % 256, g: 80, b: 160 } },
  })
    [format]()
    .toBuffer();
}

/** Stores bytes under a fresh key and returns a token for them. */
function upload(
  bytes: Buffer,
  claims: { type?: "image/png" | "image/jpeg"; size?: number; slug?: string } = {},
) {
  sequence += 1;
  const storageKey = `uploads/${String(sequence).padStart(22, "A")}`;
  stored.set(storageKey, bytes);
  return {
    storageKey,
    token: issueUploadToken({
      storageKey,
      slug: claims.slug ?? "portrait",
      type: claims.type ?? "image/png",
      size: claims.size ?? bytes.length,
      userId: AUTHOR,
    }),
  };
}

describe("a file name, as a slug", () => {
  it("keeps letters and digits, folds accents and drops the extension", () => {
    expect(slugStem("Mein Bild (Ölgemälde) 2.JPG")).toBe("mein-bild-olgemalde-2");
  });

  it("falls back to a name when nothing is left", () => {
    expect(slugStem("???.png")).toBe("upload");
  });
});

runs("checking an upload", () => {
  beforeAll(async () => {
    await emptyTestDatabase();
  });

  beforeEach(() => {
    removed.length = 0;
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("puts a real picture into the library, with its measured dimensions", async () => {
    const database = await testDatabase();
    const { token } = upload(await picture("png", 40, 30));

    const result = await completeUpload(database, token, AUTHOR);

    expect(result).toMatchObject({ slug: "portrait", width: 40, height: 30, existing: false });
    const [row] = await database.select().from(media).where(eq(media.id, result.id));
    expect(row?.mimeType).toBe("image/png");
  });

  it("returns the existing picture for the same file, and keeps no second copy", async () => {
    const database = await testDatabase();
    const bytes = await picture("png");
    const first = await completeUpload(database, upload(bytes).token, AUTHOR);
    const second = upload(bytes);

    const result = await completeUpload(database, second.token, AUTHOR);

    expect(result).toMatchObject({ id: first.id, existing: true });
    expect(removed).toContain(second.storageKey);
  });

  it("numbers the slug when the name is taken", async () => {
    const database = await testDatabase();
    await completeUpload(database, upload(await picture("png"), { slug: "taken" }).token, AUTHOR);

    const result = await completeUpload(
      database,
      upload(await picture("png"), { slug: "taken" }).token,
      AUTHOR,
    );

    expect(result.slug).toBe("taken-2");
  });

  it("refuses a file that is not the type it was declared as, and removes it", async () => {
    const database = await testDatabase();
    const { token, storageKey } = upload(await picture("jpeg"), { type: "image/png" });

    await expect(completeUpload(database, token, AUTHOR)).rejects.toThrow("not the picture");
    expect(removed).toContain(storageKey);
  });

  it("refuses text renamed to look like a picture", async () => {
    const database = await testDatabase();
    const { token, storageKey } = upload(Buffer.from("not a picture at all"));

    await expect(completeUpload(database, token, AUTHOR)).rejects.toThrow("not the picture");
    expect(removed).toContain(storageKey);
  });

  it("refuses a file that is not the size it was declared as", async () => {
    const database = await testDatabase();
    const bytes = await picture("png");
    const { token } = upload(bytes, { size: bytes.length + 1 });

    await expect(completeUpload(database, token, AUTHOR)).rejects.toThrow("not the size");
  });

  it("refuses to complete somebody else's upload", async () => {
    const database = await testDatabase();
    const { token } = upload(await picture("png"));

    await expect(completeUpload(database, token, "00000000-0000-4000-8000-000000000002")).rejects.toThrow(
      "not valid",
    );
  });
});
