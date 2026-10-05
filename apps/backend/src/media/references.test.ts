import { randomUUID } from "node:crypto";
import type { SaveEntryBody } from "@layered/schemas";
import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  entries,
  entryTranslations,
  media,
  mediaDeletions,
  mediaJobs,
  mediaReferences,
  mediaVariants,
  users,
} from "../db/schema/index.js";
import { createTranslation, saveEntry } from "../entries/repository.js";
import { closeTestDatabase, hasTestDatabase, testDatabase } from "../test-support/database.js";
import { getMediaDetail, listMedia } from "./library.js";
import { referencedMediaIds } from "./references.js";

const storage = vi.hoisted(() => ({ keys: new Set<string>(), failOnce: "" }));
vi.mock("./storage.js", () => ({
  deleteMediaObject: async (key: string) => {
    if (key === storage.failOnce) {
      storage.failOnce = "";
      throw new Error("owned storage failure");
    }
    storage.keys.delete(key);
  },
}));
const { deleteMedia } = await import("./deletion.js");
const owned = { media: [] as string[], entries: [] as string[], users: [] as string[] };
async function fixture() {
  const db = await testDatabase();
  const id = randomUUID();
  const entryId = randomUUID();
  const actor = randomUUID();
  const translation = randomUUID();
  const other = randomUUID();
  owned.media.push(id, other);
  owned.entries.push(entryId);
  owned.users.push(actor);
  await db.insert(users).values({
    id: actor,
    email: `${actor}@example.test`,
    passwordHash: "not-a-login",
    displayName: "Fixture owner",
  });
  await db.insert(entries).values({ id: entryId, kind: "post" });
  await db
    .insert(entryTranslations)
    .values({ id: translation, entryId, language: "en", title: "Owned original" });
  await db.insert(media).values(
    [id, other].map((mediaId) => ({
      id: mediaId,
      slug: `reference-${mediaId}`,
      kind: "image" as const,
      mimeType: "image/png",
      storageKey: `test/${mediaId}`,
      byteSize: 5,
      checksum: mediaId,
      width: 400,
      height: 200,
    })),
  );
  for (const key of [`test/${id}`, `test/${other}`, `test/${id}-variant`]) storage.keys.add(key);
  await db.insert(mediaVariants).values({
    mediaId: id,
    format: "webp",
    width: 348,
    height: 174,
    byteSize: 3,
    storageKey: `test/${id}-variant`,
  });
  const value: SaveEntryBody = {
    title: "Owned original",
    summary: null,
    body: `Gallery(columns: 2) {\n  Image("reference-${id}", caption: "reference-${other}")\n}\n\n\`Image("reference-${other}")\``,
    state: "draft",
    readingWidth: "normal",
    showInOtherLanguage: false,
    topicIds: [],
    slug: `owned-${translation}`,
  };
  return { db, id, other, actor, translation, value };
}
it("resolves Markdown destinations and nested components, excluding captions, code and unused link declarations", () => {
  const assets = [
    { id: "a", slug: "picture", storageKey: "migration/picture.png" },
    { id: "b", slug: "caption", storageKey: "uploads/caption" },
  ];
  expect(
    referencedMediaIds(
      'Image("picture", caption: "caption")\n\n![Image](/media/picture.png)\n\n`Image("caption")`\n\n[unused]: /uploads/caption',
      assets,
    ),
  ).toEqual(["a"]);
});
it.each([
  'Button("Download", href: "/migration/picture.png")',
  'Card(href: "/media/picture.png") {\n  Read this file.\n}',
])("indexes a rendered component link: %s", (body) => {
  expect(
    referencedMediaIds(body, [{ id: "a", slug: "picture", storageKey: "migration/picture.png" }]),
  ).toEqual(["a"]);
});
(hasTestDatabase ? describe : describe.skip)("reference index and protected deletion", () => {
  afterAll(async () => {
    const db = await testDatabase();
    if (owned.entries.length) await db.delete(entries).where(inArray(entries.id, owned.entries));
    if (owned.users.length) await db.delete(users).where(inArray(users.id, owned.users));
    if (owned.media.length) {
      await db.delete(media).where(inArray(media.id, owned.media));
      await db.delete(mediaDeletions).where(inArray(mediaDeletions.mediaId, owned.media));
    }
    storage.keys.clear();
    await closeTestDatabase();
  });
  it("indexes saved bodies, names blockers and releases objects when the actual reference is removed", async () => {
    const { db, id, other, actor, translation, value } = await fixture();
    await saveEntry(db, translation, value, actor);
    expect(
      (await db.select().from(mediaReferences).where(eq(mediaReferences.translationId, translation))).map(
        (row) => row.mediaId,
      ),
    ).toEqual([id]);
    expect((await getMediaDetail(db, id)).uses).toEqual([
      expect.objectContaining({ id: translation, title: "Owned original" }),
    ]);
    await expect(deleteMedia(db, id)).rejects.toThrow(/Owned original/);
    expect(storage.keys.has(`test/${id}`)).toBe(true);
    expect(
      (await listMedia(db, { search: `reference-${id}`, kind: "all", page: 1, unused: true })).items,
    ).toEqual([]);
    expect(
      (await listMedia(db, { search: `reference-${other}`, kind: "all", page: 1, unused: true })).items.map(
        (item) => item.id,
      ),
    ).toEqual([other]);
    await saveEntry(db, translation, { ...value, body: "The file is no longer named." }, actor);
    expect(await deleteMedia(db, id)).toMatchObject({
      deleted: true,
      removedObjects: 2,
      cleanupState: "ready",
    });
    expect(await db.select().from(media).where(eq(media.id, id))).toEqual([]);
    expect(storage.keys.has(`test/${id}`)).toBe(false);
    expect(storage.keys.has(`test/${id}-variant`)).toBe(false);
    expect(storage.keys.has(`test/${other}`)).toBe(true);
  });
  it("indexes the copied body when creating its other language", async () => {
    const { db, id, actor, translation, value } = await fixture();
    await saveEntry(db, translation, value, actor);
    const translated = await createTranslation(db, translation, actor);
    expect((await getMediaDetail(db, id)).uses.map((use) => use.id).sort()).toEqual(
      [translation, translated.id].sort(),
    );
  });
  it("protects portraits, covers and processing work even without a body reference", async () => {
    const { db, id, actor, translation } = await fixture();
    await db.update(users).set({ avatarMediaId: id }).where(eq(users.id, actor));
    await expect(deleteMedia(db, id)).rejects.toThrow(/Fixture owner/);
    expect(
      (await listMedia(db, { search: `reference-${id}`, kind: "all", page: 1, unused: true })).items,
    ).toEqual([]);
    await db.update(users).set({ avatarMediaId: null }).where(eq(users.id, actor));
    await db
      .update(entryTranslations)
      .set({ featuredMediaId: id })
      .where(eq(entryTranslations.id, translation));
    await expect(deleteMedia(db, id)).rejects.toThrow(/Owned original/);
    await db
      .update(entryTranslations)
      .set({ featuredMediaId: null })
      .where(eq(entryTranslations.id, translation));
    await db.insert(mediaJobs).values({ mediaId: id });
    await expect(deleteMedia(db, id)).rejects.toThrow(/still being processed/);
    expect(storage.keys.has(`test/${id}`)).toBe(true);
  });
  it("retains a durable cleanup after storage failure and resumes idempotently", async () => {
    const { db, id, other } = await fixture();
    storage.failOnce = `test/${id}-variant`;
    const pending = await deleteMedia(db, id);
    expect(pending).toMatchObject({ deleted: true, cleanupState: "pending", removedObjects: 0 });
    expect(pending.errorId).toMatch(/^[a-f0-9-]{36}$/);
    expect(await db.select().from(media).where(eq(media.id, id))).toEqual([]);
    expect(await deleteMedia(db, id)).toMatchObject({
      cleanupState: "ready",
      removedObjects: 2,
      errorId: null,
    });
    expect(storage.keys.has(`test/${id}-variant`)).toBe(false);
    expect(storage.keys.has(`test/${other}`)).toBe(true);
  });
});
