import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, describe, expect, it, vi } from "vitest";
import { media, mediaAttempts, mediaJobs, mediaVariants } from "../db/schema/index.js";
import { closeTestDatabase, hasTestDatabase, testDatabase } from "../test-support/database.js";

const store = vi.hoisted(() => new Map<string, Buffer>());
const control = vi.hoisted(() => ({
  blockNext: false,
  entered: undefined as (() => void) | undefined,
  released: undefined as Promise<void> | undefined,
  blockedDeletes: new Set<string>(),
  blockedKey: "",
}));
vi.mock("./storage.js", () => ({
  readMediaBytes: async (key: string) => {
    const bytes = store.get(key);
    if (!bytes) throw new Error("missing");
    return bytes;
  },
  writeMediaBytes: async (key: string, bytes: Buffer) => {
    if (control.blockNext) {
      control.blockNext = false;
      control.blockedKey = key;
      control.entered?.();
      await control.released;
    }
    store.set(key, bytes);
  },
  deleteMediaObject: async (key: string) => {
    if (control.blockedDeletes.has(key)) throw new Error("owned cleanup failure");
    store.delete(key);
  },
}));

import { listAccountMedia } from "../account/repository.js";
import { publicMedia } from "../content/snapshot.js";
import { getMediaProcessing } from "./processing.js";
import { queueMediaProcessing } from "./queue.js";
import { variantChecksum } from "./variants.js";

const { processMediaJob } = await import("./jobs.js");
const ids: string[] = [];
async function fixture() {
  const db = await testDatabase();
  const id = randomUUID();
  ids.push(id);
  const key = `test/${id}`;
  store.set(
    key,
    await sharp({ create: { width: 400, height: 200, channels: 3, background: "red" } })
      .png()
      .toBuffer(),
  );
  await db.insert(media).values({
    id,
    slug: `job-${id}`,
    kind: "image",
    mimeType: "image/png",
    storageKey: key,
    byteSize: 1,
    checksum: id,
    width: 400,
    height: 200,
  });
  await db.insert(mediaJobs).values({ mediaId: id });
  return { db, id, key };
}
(hasTestDatabase ? describe : describe.skip)("persisted image jobs", () => {
  afterAll(async () => {
    const db = await testDatabase();
    if (ids.length) await db.delete(media).where(inArray(media.id, ids));
    if (ids.length) await db.delete(mediaAttempts).where(inArray(mediaAttempts.mediaId, ids));
    store.clear();
    await closeTestDatabase();
  });
  it("publishes dimensions, immutable keys and the blur only after successful processing", async () => {
    const { db, id } = await fixture();
    expect(await processMediaJob(db, id)).toBe(true);
    const variants = await db.select().from(mediaVariants).where(eq(mediaVariants.mediaId, id));
    expect(variants.map(({ width, height }) => [width, height])).toEqual([
      [348, 174],
      [348, 174],
    ]);
    expect(
      variants.every(
        ({ storageKey }) => /[a-f0-9]{64}\.(avif|webp)$/.test(storageKey) && store.has(storageKey),
      ),
    ).toBe(true);
    const [row] = await db.select().from(media).where(eq(media.id, id));
    expect(row?.placeholder).toMatch(/^data:image\/webp;base64,/);
    const [job] = await db.select().from(mediaJobs).where(eq(mediaJobs.mediaId, id));
    expect(job?.state).toBe("ready");
    expect((await getMediaProcessing(db, id)).variants).toHaveLength(2);
    const listing = await listAccountMedia(db, { search: `job-${id}`, page: 1 });
    expect(listing.items[0]?.processingState).toBe("ready");
    const published = await publicMedia(db, [{ body: "", featuredMediaId: id }]);
    expect(published.media[0]?.placeholder).toBe(row?.placeholder);
  });
  it("reclaims an expired lease and removes only that attempt's recorded objects", async () => {
    const { db, id, key } = await fixture();
    const abandoned = `test/abandoned-${id}`;
    store.set(abandoned, Buffer.from("old"));
    await db
      .update(mediaJobs)
      .set({
        state: "processing",
        claimToken: randomUUID(),
        leaseExpiresAt: new Date(0),
        objectKeys: [abandoned],
      })
      .where(eq(mediaJobs.mediaId, id));
    await processMediaJob(db, id);
    expect(store.has(abandoned)).toBe(false);
    expect(store.has(key)).toBe(true);
  });
  it("replaces every size once a watermark queues the picture again, and delivers only marked ones", async () => {
    const { db, id, key } = await fixture();
    await processMediaJob(db, id);
    const unmarked = await db.select().from(mediaVariants).where(eq(mediaVariants.mediaId, id));
    await db.update(media).set({ watermark: "bottom-right" }).where(eq(media.id, id));
    await queueMediaProcessing(db, [id]);
    expect(await processMediaJob(db, id)).toBe(true);
    const marked = await db.select().from(mediaVariants).where(eq(mediaVariants.mediaId, id));
    expect(marked.map(({ format, width }) => `${format} ${width}`).sort()).toEqual([
      "avif 348",
      "avif 400",
      "webp 348",
      "webp 400",
    ]);
    for (const { storageKey } of unmarked) expect(store.has(storageKey)).toBe(false);
    for (const { storageKey } of marked) expect(store.has(storageKey)).toBe(true);
    expect(store.has(key)).toBe(true);
    expect(await db.select().from(mediaAttempts).where(eq(mediaAttempts.mediaId, id))).toEqual([]);

    const full = marked.find(({ format, width }) => format === "webp" && width === 400);
    const [published] = (await publicMedia(db, [{ body: "", featuredMediaId: id }])).media;
    expect(published?.src).toBe(`/${full?.storageKey}`);
    expect(published?.source).toBe(full?.storageKey);
    expect(published?.mime).toBe("image/webp");
    expect(published?.sha256).toBe(variantChecksum(full?.storageKey ?? ""));
    expect(JSON.stringify(published)).not.toContain(key);
  });
  it("allows only one worker to claim a picture", async () => {
    const { db, id } = await fixture();
    const outcomes = await Promise.all([processMediaJob(db, id), processMediaJob(db, id)]);
    expect(outcomes.sort()).toEqual([false, true]);
  });
  it("records a safe failure identifier without publishing incomplete variants", async () => {
    const { db, id, key } = await fixture();
    store.delete(key);
    await processMediaJob(db, id);
    const [job] = await db.select().from(mediaJobs).where(eq(mediaJobs.mediaId, id));
    expect(job?.state).toBe("failed");
    expect(job?.errorId).toMatch(/^[a-f0-9-]{36}$/);
    expect(await db.select().from(mediaVariants).where(eq(mediaVariants.mediaId, id))).toEqual([]);
  });
  it("durably reclaims late writes from a replaced worker after its cleanup failed", async () => {
    const { db, id, key } = await fixture();
    let release!: () => void;
    const entered = new Promise<void>((resolve) => {
      control.entered = resolve;
    });
    control.released = new Promise<void>((resolve) => {
      release = resolve;
    });
    control.blockNext = true;
    const oldWorker = processMediaJob(db, id);
    try {
      await entered;
      await db
        .update(mediaJobs)
        .set({ leaseExpiresAt: new Date(0) })
        .where(eq(mediaJobs.mediaId, id));
      await processMediaJob(db, id);
      const current = await db.select().from(mediaVariants).where(eq(mediaVariants.mediaId, id));
      control.blockedDeletes.add(control.blockedKey);
      release();
      await oldWorker;
      expect(store.has(control.blockedKey)).toBe(true);
      control.blockedDeletes.clear();
      await processMediaJob(db, id);
      const expected = new Set([key, ...current.map((variant) => variant.storageKey)]);
      expect([...store.keys()].filter((path) => path.includes(id)).sort()).toEqual([...expected].sort());
      expect((await getMediaProcessing(db, id)).state).toBe("ready");
    } finally {
      release();
      control.blockedDeletes.clear();
      await oldWorker;
    }
  });
});
