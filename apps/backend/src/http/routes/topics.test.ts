import { type TopicList, type TopicListItem, topicList, topicListItem } from "@layered/schemas";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { readPublicSnapshot } from "../../content/snapshot.js";
import { auditLog, entryTopics } from "../../db/schema/index.js";
import { closeTestDatabase, hasTestDatabase, testDatabase } from "../../test-support/database.js";
import { seedEditorialLibrary, signedInCookie } from "../../test-support/editorial.js";
import { app } from "../app.js";

/**
 * The topics screen and the topic field, against the real database, because
 * what matters is what a rename, a merge or a delete leaves behind: the
 * entries, the addresses and the log. The library is `test-support/editorial.ts`,
 * with "Retro Computing" named in both languages and "Soldering" in English only.
 */

const runs = hasTestDatabase ? describe : describe.skip;

async function send(path: string, cookie: string, method = "GET", value?: unknown): Promise<Response> {
  return app.request(path, {
    method,
    headers: { cookie, ...(value === undefined ? {} : { "content-type": "application/json" }) },
    ...(value === undefined ? {} : { body: JSON.stringify(value) }),
  });
}

async function topicsOf(cookie: string): Promise<TopicList> {
  const response = await send("/topics", cookie);
  expect(response.status).toBe(200);
  return topicList.parse(((await response.json()) as { data: unknown }).data);
}

function named(topics: TopicList, name: string): TopicListItem {
  const topic = topics.find((item) => item.en?.name === name || item.de?.name === name);
  if (!topic) throw new Error(`no topic named ${name}`);
  return topic;
}

async function itemOf(response: Response): Promise<TopicListItem> {
  expect(response.status).toBe(200);
  return topicListItem.parse(((await response.json()) as { data: unknown }).data);
}

runs("the topics", () => {
  afterAll(async () => {
    await closeTestDatabase();
  });

  beforeEach(async () => {
    await seedEditorialLibrary();
  });

  it("lists every topic with both languages, a missing one as null, and how many entries have it", async () => {
    const topics = await topicsOf(await signedInCookie());

    expect(topics.map(({ en, de, entryCount }) => ({ en, de, entryCount }))).toEqual([
      {
        en: { name: "Retro Computing", slug: "retro-computing" },
        de: { name: "Retro-Computer", slug: "retro-computer" },
        entryCount: 1,
      },
      { en: { name: "Soldering", slug: "soldering" }, de: null, entryCount: 1 },
    ]);
  });

  it("creates a topic from a typed name, and returns the existing one for a name already taken", async () => {
    const cookie = await signedInCookie();

    const created = await itemOf(
      await send("/topics", cookie, "POST", { language: "de", name: "Lötkolben" }),
    );
    expect(created).toMatchObject({ en: null, de: { name: "Lötkolben", slug: "loetkolben" }, entryCount: 0 });

    const again = await itemOf(await send("/topics", cookie, "POST", { language: "en", name: "soldering" }));
    expect(again.en?.name).toBe("Soldering");
    expect(await topicsOf(cookie)).toHaveLength(3);
  });

  it("numbers the address of a new topic whose plain one is held as a former address", async () => {
    const cookie = await signedInCookie();
    const soldering = named(await topicsOf(cookie), "Soldering");
    await itemOf(
      await send(`/topics/${soldering.id}`, cookie, "PUT", {
        en: { name: "Soldering", slug: "soldering-irons" },
        de: null,
      }),
    );

    const created = await itemOf(
      await send("/topics", cookie, "POST", { language: "en", name: "Soldering!" }),
    );
    expect(created.en?.slug).toBe("soldering-2");
  });

  it("renames a topic, gives it a German name, and keeps the old address as a redirect", async () => {
    const cookie = await signedInCookie();
    const soldering = named(await topicsOf(cookie), "Soldering");

    const saved = await itemOf(
      await send(`/topics/${soldering.id}`, cookie, "PUT", {
        en: { name: "Soldering irons", slug: "soldering-irons" },
        de: { name: "Lötkolben", slug: "loetkolben" },
      }),
    );
    expect(saved).toMatchObject({
      en: { name: "Soldering irons", slug: "soldering-irons" },
      de: { name: "Lötkolben", slug: "loetkolben" },
    });

    const snapshot = await readPublicSnapshot(await testDatabase());
    expect(snapshot.redirects).toContainEqual({
      source: "/topics/soldering/",
      target: "/topics/soldering-irons/",
    });

    const logged = await (await testDatabase())
      .select({ action: auditLog.action, detail: auditLog.detail })
      .from(auditLog)
      .where(eq(auditLog.subjectId, soldering.id));
    expect(logged).toEqual([{ action: "topic.updated", detail: { changedKeys: ["en", "de"] } }]);
  });

  it("refuses an address another topic holds, a topic with no name, and an address the site cannot use", async () => {
    const cookie = await signedInCookie();
    const topics = await topicsOf(cookie);
    const soldering = named(topics, "Soldering");

    const taken = await send(`/topics/${soldering.id}`, cookie, "PUT", {
      en: { name: "Soldering", slug: "retro-computing" },
      de: null,
    });
    expect(taken.status).toBe(409);

    for (const value of [
      { en: null, de: null },
      { en: { name: "Soldering", slug: "Soldering Irons" }, de: null },
      { en: { name: "Soldering", slug: "soldering" } },
    ]) {
      expect((await send(`/topics/${soldering.id}`, cookie, "PUT", value)).status).toBe(400);
    }
  });

  it("merges a topic into another: the entries move, the old address redirects, the topic is gone", async () => {
    const cookie = await signedInCookie();
    const topics = await topicsOf(cookie);
    const soldering = named(topics, "Soldering");
    const retro = named(topics, "Retro Computing");

    const remaining = await itemOf(
      await send(`/topics/${soldering.id}/merge`, cookie, "POST", { into: retro.id }),
    );
    expect(remaining.entryCount).toBe(2);

    const after = await topicsOf(cookie);
    expect(after.map((topic) => topic.en?.name)).toEqual(["Retro Computing"]);

    const snapshot = await readPublicSnapshot(await testDatabase());
    expect(snapshot.redirects).toContainEqual({
      source: "/topics/soldering/",
      target: "/topics/retro-computing/",
    });
    expect(snapshot.redirects).toContainEqual({
      source: "/de/topics/soldering/",
      target: "/de/topics/retro-computing/",
    });
  });

  it("refuses to merge a topic into itself", async () => {
    const cookie = await signedInCookie();
    const soldering = named(await topicsOf(cookie), "Soldering");

    const response = await send(`/topics/${soldering.id}/merge`, cookie, "POST", { into: soldering.id });
    expect(response.status).toBe(400);
  });

  it("deletes a topic, takes it off its entries, and logs how many lost it", async () => {
    const cookie = await signedInCookie();
    const soldering = named(await topicsOf(cookie), "Soldering");

    expect((await send(`/topics/${soldering.id}`, cookie, "DELETE")).status).toBe(200);

    const database = await testDatabase();
    expect(await database.select().from(entryTopics).where(eq(entryTopics.topicId, soldering.id))).toEqual(
      [],
    );
    const logged = await database
      .select({ action: auditLog.action, detail: auditLog.detail })
      .from(auditLog)
      .where(eq(auditLog.subjectId, soldering.id));
    expect(logged).toEqual([{ action: "topic.deleted", detail: { entries: 1 } }]);
    expect((await send(`/topics/${soldering.id}`, cookie, "DELETE")).status).toBe(404);
  });

  it("refuses a request without a session", async () => {
    expect((await app.request("/topics")).status).toBe(401);
  });
});
