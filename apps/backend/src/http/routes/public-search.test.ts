import { randomUUID } from "node:crypto";
import { publicSearchResults } from "@layered/schemas";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  entries,
  entryTopics,
  entryTranslations,
  paths,
  topics,
  topicTranslations,
} from "../../db/schema/index.js";
import { closeTestDatabase, hasTestDatabase, testDatabase } from "../../test-support/database.js";
import { app } from "../app.js";

const scope = `probe${randomUUID().replaceAll("-", "")}`;
const ids = [
  randomUUID(),
  randomUUID(),
  randomUUID(),
  randomUUID(),
  randomUUID(),
  randomUUID(),
  randomUUID(),
] as const;
const topicId = randomUUID();
beforeAll(async () => {
  if (!hasTestDatabase) return;
  const db = await testDatabase();
  await db.insert(entries).values(ids.map((id) => ({ id, kind: "post" as const })));
  const rows = await db
    .insert(entryTranslations)
    .values([
      {
        entryId: ids[0],
        language: "en",
        title: "English title",
        summary: `orbiting ${scope}`,
        body: `running ${scope}`,
        state: "public",
      },
      { entryId: ids[1], language: "de", title: "Deutscher Titel", body: `Häuser ${scope}`, state: "public" },
      { entryId: ids[2], language: "en", title: "Hidden", body: `confidential ${scope}`, state: "hidden" },
      { entryId: ids[3], language: "en", title: "Draft", body: `confidential ${scope}`, state: "draft" },
      {
        entryId: ids[4],
        language: "en",
        title: "Trashed",
        body: `confidential ${scope}`,
        state: "public",
        trashedAt: new Date(),
      },
      {
        entryId: ids[5],
        language: "en",
        title: "No address",
        body: `confidential ${scope}`,
        state: "public",
      },
      { entryId: ids[6], language: "en", title: `running ${scope}`, body: "", state: "public" },
    ])
    .returning({ id: entryTranslations.id, entryId: entryTranslations.entryId });
  await db
    .insert(paths)
    .values(
      rows
        .filter((row) => row.entryId !== ids[5])
        .map((row) => ({ translationId: row.id, path: `/probe-${row.entryId}/` })),
    );
  await db.insert(topics).values({ id: topicId });
  await db
    .insert(topicTranslations)
    .values({ topicId, language: "en", name: `telescopes ${scope}`, slug: scope });
  await db.insert(entryTopics).values({ entryId: ids[0], topicId });
});
afterAll(async () => {
  if (!hasTestDatabase) return;
  const db = await testDatabase();
  await db.delete(entries).where(inArray(entries.id, ids));
  await db.delete(topics).where(eq(topics.id, topicId));
  await closeTestDatabase();
});
const search = async (q: string, language: string, extra = {}) => {
  const response = await app.request(`/content/search?${new URLSearchParams({ q, language, ...extra })}`);
  expect(response.status).toBe(200);
  return publicSearchResults.parse(await response.json());
};
it.skipIf(!hasTestDatabase)(
  "uses English and German stemming, with titles ranked before body matches",
  async () => {
    const en = await search(`run ${scope}`, "en");
    expect(en.entries.map((hit: { title: string }) => hit.title)).toEqual([
      `running ${scope}`,
      "English title",
    ]);
    expect((await search(`Haus ${scope}`, "de")).entries).toHaveLength(1);
    expect((await search(`Haus ${scope}`, "en")).entries).toHaveLength(0);
    expect((await search(`orbit ${scope}`, "en")).entries).toHaveLength(1);
    expect((await search(`telescope ${scope}`, "en")).entries).toHaveLength(1);
  },
);
it.skipIf(!hasTestDatabase)(
  "excludes hidden, draft, trashed and unreachable bodies without a session",
  async () => {
    expect(await search(`confidential ${scope}`, "en")).toEqual({ entries: [], total: 0 });
    const first = await search(`run ${scope}`, "en", { limit: "1", page: "1" });
    const second = await search(`run ${scope}`, "en", { limit: "1", page: "2" });
    expect(first.total).toBe(2);
    expect(second.total).toBe(2);
    expect(first.entries[0]?.path).not.toBe(second.entries[0]?.path);
    expect(Object.keys(first.entries[0] ?? {}).sort()).toEqual(["kind", "language", "path", "title"]);
  },
);
it("rejects invalid public search input before querying", async () => {
  for (const query of [
    "q=&language=en",
    "q=hello&language=fr",
    "q=hello&language=en&limit=101",
    "q=%00&language=en",
    `q=${"x".repeat(121)}&language=en`,
  ])
    expect((await app.request(`/content/search?${query}`)).status).toBe(400);
});
