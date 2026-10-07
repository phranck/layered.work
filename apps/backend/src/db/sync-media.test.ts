import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  closeTestDatabase,
  emptyTestDatabase,
  hasTestDatabase,
  testDatabase,
} from "../test-support/database.js";
import { media, mediaVariants } from "./schema/index.js";
import { syncMissingObjects } from "./sync-media.js";

const runs = hasTestDatabase ? describe : describe.skip;
let root: string;

function checksum(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

runs("syncing the library to the bucket", () => {
  beforeEach(async () => {
    await emptyTestDatabase();
    root = await mkdtemp(join(tmpdir(), "layered-media-sync-"));
    await mkdir(join(root, "uploads"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("uploads only database keys missing from the bucket and checks the returned bytes", async () => {
    const database = await testDatabase();
    const present = Buffer.from("already there");
    const missing = Buffer.from("upload this");
    await writeFile(join(root, "uploads", "missing"), missing);
    await database.insert(media).values([
      {
        slug: "present",
        kind: "document",
        mimeType: "application/pdf",
        storageKey: "uploads/present",
        byteSize: present.length,
        checksum: checksum(present),
      },
      {
        slug: "missing",
        kind: "document",
        mimeType: "application/pdf",
        storageKey: "uploads/missing",
        byteSize: missing.length,
        checksum: checksum(missing),
      },
    ]);

    const objects = new Map<string, Buffer>([["uploads/present", present]]);
    const uploaded: string[] = [];
    const synced = await syncMissingObjects(database, root, {
      exists: async (key) => objects.has(key),
      put: async (key, bytes) => {
        uploaded.push(key);
        objects.set(key, bytes);
      },
      read: async (key) => objects.get(key) ?? Promise.reject(new Error(`Missing ${key}`)),
    });

    expect(synced).toEqual(["uploads/missing"]);
    expect(uploaded).toEqual(["uploads/missing"]);
    expect(objects.get("uploads/missing")).toEqual(missing);
  });

  it("fails when the bucket returns bytes that differ from the database checksum", async () => {
    const database = await testDatabase();
    const bytes = Buffer.from("correct bytes");
    await writeFile(join(root, "uploads", "wrong"), bytes);
    await database.insert(media).values({
      slug: "wrong",
      kind: "document",
      mimeType: "application/pdf",
      storageKey: "uploads/wrong",
      byteSize: bytes.length,
      checksum: checksum(bytes),
    });

    await expect(
      syncMissingObjects(database, root, {
        exists: async () => false,
        put: async () => {},
        read: async () => Buffer.from("damaged bytes"),
      }),
    ).rejects.toThrow("uploads/wrong");
  });

  it("refuses local bytes that differ from the database before uploading", async () => {
    const database = await testDatabase();
    const original = Buffer.from("original bytes");
    const valid = Buffer.from("valid bytes");
    await writeFile(join(root, "uploads", "valid"), valid);
    await writeFile(join(root, "uploads", "changed"), Buffer.from("changed bytes"));
    await database.insert(media).values([
      {
        slug: "a-valid",
        kind: "document",
        mimeType: "application/pdf",
        storageKey: "uploads/valid",
        byteSize: valid.length,
        checksum: checksum(valid),
      },
      {
        slug: "z-changed",
        kind: "document",
        mimeType: "application/pdf",
        storageKey: "uploads/changed",
        byteSize: original.length,
        checksum: checksum(original),
      },
    ]);

    let uploads = 0;
    await expect(
      syncMissingObjects(database, root, {
        exists: async () => false,
        put: async () => {
          uploads += 1;
        },
        read: async (key) => (key === "uploads/valid" ? valid : original),
      }),
    ).rejects.toThrow("uploads/changed");
    expect(uploads).toBe(0);
  });

  /** An image whose original the bucket already holds, with one derived size of the given recorded length. */
  async function imageWithSize(sizeBytes: Buffer, recordedSize = sizeBytes.length): Promise<string> {
    const database = await testDatabase();
    const original = Buffer.from("original picture");
    const [row] = await database
      .insert(media)
      .values({
        slug: "cover",
        kind: "image",
        mimeType: "image/jpeg",
        storageKey: "uploads/cover.jpg",
        byteSize: original.length,
        checksum: checksum(original),
        width: 1200,
        height: 600,
      })
      .returning({ id: media.id });
    if (!row) throw new Error("No image row.");
    const storageKey = `variants/${row.id}/attempt/cover.avif`;
    await mkdir(join(root, "variants", row.id, "attempt"), { recursive: true });
    await writeFile(join(root, storageKey), sizeBytes);
    await database.insert(mediaVariants).values({
      mediaId: row.id,
      format: "avif",
      width: 348,
      height: 174,
      byteSize: recordedSize,
      storageKey,
    });
    return storageKey;
  }

  it("uploads a size the bucket is missing beside an original it holds, with the size's type", async () => {
    const size = Buffer.from("derived size");
    const storageKey = await imageWithSize(size);
    const objects = new Map<string, Buffer>([["uploads/cover.jpg", Buffer.from("original picture")]]);
    const types = new Map<string, string>();

    const synced = await syncMissingObjects(await testDatabase(), root, {
      exists: async (key) => objects.has(key),
      put: async (key, bytes, mimeType) => {
        objects.set(key, bytes);
        types.set(key, mimeType);
      },
      read: async (key) => objects.get(key) ?? Promise.reject(new Error(`Missing ${key}`)),
    });

    expect(synced).toEqual([storageKey]);
    expect(objects.get(storageKey)).toEqual(size);
    expect(types.get(storageKey)).toBe("image/avif");
  });

  it("refuses a size whose local bytes differ from its recorded length before uploading anything", async () => {
    const storageKey = await imageWithSize(Buffer.from("truncated"), 4096);
    let uploads = 0;

    await expect(
      syncMissingObjects(await testDatabase(), root, {
        exists: async (key) => key === "uploads/cover.jpg",
        put: async () => {
          uploads += 1;
        },
        read: async () => Buffer.alloc(0),
      }),
    ).rejects.toThrow(storageKey);
    expect(uploads).toBe(0);
  });

  it("fails when the bucket returns a size of a different length than was uploaded", async () => {
    const storageKey = await imageWithSize(Buffer.from("derived size"));

    await expect(
      syncMissingObjects(await testDatabase(), root, {
        exists: async (key) => key === "uploads/cover.jpg",
        put: async () => {},
        read: async () => Buffer.from("cut"),
      }),
    ).rejects.toThrow(storageKey);
  });
});
