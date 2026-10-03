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
import { media } from "./schema/index.js";
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
});
