import { randomUUID } from "node:crypto";
import { focalPoint } from "@layered/schemas";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { publicMedia } from "../content/snapshot.js";
import { media } from "../db/schema/index.js";
import { closeTestDatabase, hasTestDatabase, testDatabase } from "../test-support/database.js";
import { saveMediaFocalPoint } from "./focal.js";
import { listMedia } from "./library.js";

const id = randomUUID();
(hasTestDatabase ? describe : describe.skip)("one focal point on every surface", () => {
  afterAll(async () => {
    const db = await testDatabase();
    await db.delete(media).where(eq(media.id, id));
    await closeTestDatabase();
  });
  it("persists bounded coordinates and returns them from both public and library readers", async () => {
    const db = await testDatabase();
    await db.insert(media).values({
      id,
      slug: `focal-${id}`,
      kind: "image",
      mimeType: "image/png",
      storageKey: `test/${id}`,
      byteSize: 1,
      checksum: id,
      width: 400,
      height: 200,
    });
    await saveMediaFocalPoint(db, id, { x: 0.2, y: 0.8 });
    expect((await publicMedia(db, [{ body: "", featuredMediaId: id }])).media[0]?.focalPoint).toEqual({
      x: 0.2,
      y: 0.8,
    });
    const listing = await listMedia(db, { search: `focal-${id}`, kind: "all", page: 1, order: "slug" });
    expect(listing.items[0]?.focalPoint).toEqual({
      x: 0.2,
      y: 0.8,
    });
    await expect(saveMediaFocalPoint(db, id, { x: 2, y: 0 })).rejects.toThrow();
    for (const invalid of [
      { x: -1, y: 0.5 },
      { x: 0.5, y: 1.1 },
    ])
      expect(focalPoint.safeParse(invalid).success).toBe(false);
  });
});
