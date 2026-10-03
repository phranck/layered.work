import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  closeTestDatabase,
  emptyTestDatabase,
  hasTestDatabase,
  testDatabase,
} from "../test-support/database.js";
import { media } from "./schema/index.js";
import { missingObjects } from "./verify-storage.js";

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
});
