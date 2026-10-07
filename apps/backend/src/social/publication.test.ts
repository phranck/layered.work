import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import { eq, inArray } from "drizzle-orm";
import { afterAll, expect, it } from "vitest";
import { config } from "../config.js";
import { readPublicSnapshot } from "../content/snapshot.js";
import { auditLog, entries, entryTranslations, media, paths, users } from "../db/schema/index.js";
import { saveEntry } from "../entries/repository.js";
import { closeTestDatabase, hasTestDatabase, testDatabase } from "../test-support/database.js";
import { backfillSocialCards } from "./backfill.js";

afterAll(closeTestDatabase);

it.skipIf(!hasTestDatabase)(
  "stores cards only at publication, reuses unchanged cards and excludes draft media",
  async () => {
    const db = await testDatabase();
    const suffix = randomUUID();
    const userId = randomUUID(),
      entryId = randomUUID(),
      translationId = randomUUID();
    const createdMedia: string[] = [];
    await db.insert(users).values({
      id: userId,
      email: `${suffix}@example.test`,
      passwordHash: "isolated-fixture",
      displayName: "Social card test",
    });
    await db.insert(entries).values({ id: entryId, kind: "post" });
    await db
      .insert(entryTranslations)
      .values({ id: translationId, entryId, language: "en", title: `Card ${suffix}` });
    const value = {
      title: `Card ${suffix}`,
      summary: "Summary must not reach the card",
      body: "Private body",
      state: "draft" as const,
      readingWidth: "normal" as const,
      showInOtherLanguage: false,
      topicIds: [],
      specs: [],
      slug: `card-${suffix}`,
    };
    try {
      await saveEntry(db, translationId, value, userId);
      const read = async () =>
        (await db.select().from(entryTranslations).where(eq(entryTranslations.id, translationId)))[0];
      expect((await read())?.socialCardMediaId).toBeNull();
      expect(await backfillSocialCards(db, [translationId])).toBe(0);
      const filesBefore = await readdir(config.MEDIA_LOCAL_DIR ?? "", { recursive: true });
      await expect(
        saveEntry(db, translationId, { ...value, state: "public" }, randomUUID()),
      ).rejects.toThrow();
      expect((await read())?.socialCardMediaId).toBeNull();
      const filesAfter = await readdir(config.MEDIA_LOCAL_DIR ?? "", { recursive: true });
      expect(filesAfter.filter((path) => path.endsWith(".png"))).toEqual(
        filesBefore.filter((path) => path.endsWith(".png")),
      );
      await saveEntry(db, translationId, { ...value, state: "public" }, userId);
      const first = (await read())?.socialCardMediaId;
      expect(first).toBeTruthy();
      if (!first) throw new Error("Publication card missing");
      createdMedia.push(first);
      await db
        .update(entryTranslations)
        .set({ socialCardMediaId: null })
        .where(eq(entryTranslations.id, translationId));
      expect(await backfillSocialCards(db, [translationId])).toBe(1);
      expect((await read())?.socialCardMediaId).toBe(first);
      expect(await backfillSocialCards(db, [translationId])).toBe(0);
      const card = (await db.select().from(media).where(eq(media.id, first)))[0];
      expect(card).toMatchObject({ mimeType: "image/png", width: 1200, height: 630 });
      const snapshot = await readPublicSnapshot(db);
      expect(snapshot.entries.find((entry) => entry.id === translationId)?.socialImage).toBe(card?.slug);
      expect(snapshot.media.some((asset) => asset.slug === card?.slug)).toBe(true);
      await saveEntry(db, translationId, { ...value, body: "Changed prose", state: "public" }, userId);
      expect((await read())?.socialCardMediaId).toBe(first);
      await saveEntry(db, translationId, { ...value, title: `Updated ${suffix}`, state: "hidden" }, userId);
      const changed = (await read())?.socialCardMediaId;
      expect(changed).not.toBe(first);
      if (changed) createdMedia.push(changed);
      await saveEntry(db, translationId, { ...value, state: "draft" }, userId);
      expect((await read())?.socialCardMediaId).toBeNull();
      expect((await readPublicSnapshot(db)).media.some((asset) => asset.slug === card?.slug)).toBe(false);
      // Publishing without another title edit must use the title saved in the draft.
      await saveEntry(db, translationId, { ...value, state: "public" }, userId);
      expect((await read())?.socialCardMediaId).toBe(first);
    } finally {
      await db.delete(auditLog).where(eq(auditLog.actorUserId, userId));
      await db.delete(paths).where(eq(paths.translationId, translationId));
      await db.delete(entries).where(eq(entries.id, entryId));
      if (createdMedia.length) await db.delete(media).where(inArray(media.id, createdMedia));
      await db.delete(users).where(eq(users.id, userId));
    }
  },
);
