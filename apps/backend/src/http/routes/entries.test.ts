import { type EntryList, entryDetail, entryList, readApiError } from "@layered/schemas";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { auditLog, paths } from "../../db/schema/index.js";
import { slugFromTitle } from "../../entries/repository.js";
import { closeTestDatabase, hasTestDatabase, testDatabase } from "../../test-support/database.js";
import { seedEditorialLibrary, signedInCookie } from "../../test-support/editorial.js";
import { app } from "../app.js";

/**
 * The entry list, against the real database, because what it answers is a
 * query: which rows, in which order, with which neighbour counted. The library
 * it reads is described in `test-support/editorial.ts`.
 */

const runs = hasTestDatabase ? describe : describe.skip;

describe("the address segment written from a title", () => {
  it("spells out German letters, drops other accents and joins words with one hyphen", () => {
    expect(slugFromTitle("Über Lötkolben & Straßen")).toBe("ueber-loetkolben-strassen");
    expect(slugFromTitle("  Café -- Résumé!  ")).toBe("cafe-resume");
    expect(slugFromTitle("???")).toBe("entry");
  });
});

async function list(kind: string, cookie: string): Promise<EntryList> {
  const response = await app.request(`/entries?kind=${kind}`, { headers: { cookie } });
  expect(response.status).toBe(200);
  return entryList.parse(((await response.json()) as { data: unknown }).data);
}

runs("the entry list", () => {
  afterAll(async () => {
    await closeTestDatabase();
  });

  beforeEach(async () => {
    await seedEditorialLibrary();
  });

  it("lists one row per translation of the asked kind, newest first", async () => {
    const rows = await list("post", await signedInCookie());

    expect(rows.map((row) => row.title)).toEqual([
      "A draft",
      "Auf Deutsch versteckt",
      "Published in English",
    ]);
    expect(rows.map((row) => row.date)).toEqual([
      "2026-01-01T00:00:00.000Z",
      "2025-06-01T00:00:00.000Z",
      "2025-05-01T00:00:00.000Z",
    ]);
  });

  it("says which rows have a counterpart in the other language", async () => {
    const rows = await list("post", await signedInCookie());
    const translated = Object.fromEntries(rows.map((row) => [row.title, row.translated]));

    expect(translated).toEqual({
      "A draft": false,
      "Auf Deutsch versteckt": true,
      "Published in English": true,
    });
  });

  it("names each row's topics in its own language where the topic has a name in it", async () => {
    const rows = await list("post", await signedInCookie());
    const named = Object.fromEntries(rows.map((row) => [row.title, row.topics]));

    expect(named).toEqual({
      "A draft": ["Soldering"],
      "Auf Deutsch versteckt": ["Retro-Computer"],
      "Published in English": ["Retro Computing"],
    });
  });

  it("offers a thumbnail only for a picture the dashboard can show", async () => {
    const rows = await list("post", await signedInCookie());
    const english = rows.find((row) => row.language === "en" && row.translated);
    const german = rows.find((row) => row.language === "de");

    expect(english?.thumbnailUrl).toMatch(/^\/api\/account\/media\/[0-9a-f-]{36}\/content$/);
    expect(german?.thumbnailUrl).toBeNull();
  });

  it("keeps pages apart from posts", async () => {
    const rows = await list("page", await signedInCookie());
    expect(rows.map((row) => row.title)).toEqual(["A page"]);
  });

  it("opens one translation with its text, its address, its topics and its other language", async () => {
    const cookie = await signedInCookie();
    const german = (await list("post", cookie)).find((row) => row.language === "de");
    const response = await app.request(`/entries/${german?.id}`, { headers: { cookie } });
    expect(response.status).toBe(200);
    const detail = entryDetail.parse(((await response.json()) as { data: unknown }).data);

    expect(detail).toMatchObject({
      title: "Auf Deutsch versteckt",
      language: "de",
      state: "hidden",
      kind: "post",
      readingWidth: "normal",
      publishedAt: "2025-06-01T00:00:00.000Z",
      counterpart: { language: "en", title: "Published in English" },
    });
    expect(detail.topics.map((topic) => topic.name)).toEqual(["Retro-Computer"]);
  });

  it("answers not found for a translation that does not exist", async () => {
    const response = await app.request("/entries/0199f064-43b7-79a8-917f-eefc8c852400", {
      headers: { cookie: await signedInCookie() },
    });
    expect(response.status).toBe(404);
  });

  it("saves a draft as public, dates the publication once, and logs both acts", async () => {
    const cookie = await signedInCookie();
    const draft = (await list("post", cookie)).find((row) => row.state === "draft");
    const save = (value: Record<string, unknown>) =>
      app.request(`/entries/${draft?.id}`, {
        method: "PUT",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          title: "A finished draft",
          summary: null,
          body: "Now it says something.",
          state: "public",
          readingWidth: "wide",
          topicIds: [],
          ...value,
        }),
      });

    const first = await save({});
    expect(first.status).toBe(200);
    const published = entryDetail.parse(((await first.json()) as { data: unknown }).data);
    expect(published).toMatchObject({ title: "A finished draft", state: "public", readingWidth: "wide" });
    expect(published.publishedAt).not.toBeNull();

    const later = entryDetail.parse(
      ((await (await save({ body: "A correction." })).json()) as { data: unknown }).data,
    );
    expect(later.publishedAt).toBe(published.publishedAt);

    const database = await testDatabase();
    const actions = await database
      .select({ action: auditLog.action, detail: auditLog.detail })
      .from(auditLog)
      .where(eq(auditLog.subjectId, draft?.id ?? ""));
    expect(actions.map((row) => row.action).sort()).toEqual([
      "entry.published",
      "entry.updated",
      "entry.updated",
    ]);
    expect(JSON.stringify(actions)).not.toContain("Now it says something");
  });

  it("sets the entry's topics for both languages, and logs that they changed", async () => {
    const cookie = await signedInCookie();
    const rows = await list("post", cookie);
    const english = rows.find((row) => row.title === "Published in English");
    const german = rows.find((row) => row.language === "de");
    const soldering = (await list("post", cookie)).find((row) => row.title === "A draft");
    const solderingDetail = entryDetail.parse(
      (
        (await (await app.request(`/entries/${soldering?.id}`, { headers: { cookie } })).json()) as {
          data: unknown;
        }
      ).data,
    );
    const retroDetail = entryDetail.parse(
      (
        (await (await app.request(`/entries/${english?.id}`, { headers: { cookie } })).json()) as {
          data: unknown;
        }
      ).data,
    );
    const topicIds = [...retroDetail.topics, ...solderingDetail.topics].map((topic) => topic.id);

    const response = await app.request(`/entries/${english?.id}`, {
      method: "PUT",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        title: "Published in English",
        summary: null,
        body: "",
        state: "public",
        readingWidth: "normal",
        topicIds,
      }),
    });
    expect(response.status).toBe(200);

    const germanDetail = entryDetail.parse(
      (
        (await (await app.request(`/entries/${german?.id}`, { headers: { cookie } })).json()) as {
          data: unknown;
        }
      ).data,
    );
    expect(germanDetail.topics.map(({ name, named }) => ({ name, named }))).toEqual([
      { name: "Retro-Computer", named: true },
      { name: "Soldering", named: false },
    ]);

    const database = await testDatabase();
    const logged = await database
      .select({ detail: auditLog.detail })
      .from(auditLog)
      .where(eq(auditLog.subjectId, english?.id ?? ""));
    expect(logged.map((row) => row.detail)).toContainEqual({ changedKeys: ["topicIds"] });
  });

  it("refuses a save that carries a field it does not take or a state it does not know", async () => {
    const cookie = await signedInCookie();
    const draft = (await list("post", cookie)).find((row) => row.state === "draft");
    for (const value of [
      {
        title: "T",
        summary: null,
        body: "",
        state: "public",
        readingWidth: "normal",
        topicIds: [],
        path: "/x/",
      },
      { title: "T", summary: null, body: "", state: "protected", readingWidth: "normal", topicIds: [] },
      { title: "", summary: null, body: "", state: "draft", readingWidth: "normal", topicIds: [] },
      { title: "T", summary: null, body: "", state: "draft", readingWidth: "normal" },
      {
        title: "T",
        summary: null,
        body: "",
        state: "draft",
        readingWidth: "normal",
        topicIds: ["0199f064-43b7-79a8-917f-eefc8c852400"],
      },
    ]) {
      const response = await app.request(`/entries/${draft?.id}`, {
        method: "PUT",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify(value),
      });
      expect(response.status).toBe(400);
    }
  });

  it("creates the other language as a linked draft, and opens it when asked again", async () => {
    const cookie = await signedInCookie();
    const draft = (await list("post", cookie)).find((row) => row.title === "A draft");
    const translate = () =>
      app.request(`/entries/${draft?.id}/translation`, { method: "POST", headers: { cookie } });

    const first = await translate();
    expect(first.status).toBe(200);
    const german = entryDetail.parse(((await first.json()) as { data: unknown }).data);
    expect(german).toMatchObject({
      language: "de",
      title: "A draft",
      state: "draft",
      path: "/de/a-draft/",
      publishedAt: null,
      counterpart: { id: draft?.id, language: "en", title: "A draft" },
    });
    expect(german.topics.map((topic) => topic.name)).toEqual(["Soldering"]);

    const again = entryDetail.parse(((await (await translate()).json()) as { data: unknown }).data);
    expect(again.id).toBe(german.id);

    const rows = await list("post", cookie);
    expect(rows.filter((row) => row.entryId === draft?.entryId).map((row) => row.translated)).toEqual([
      true,
      true,
    ]);

    const database = await testDatabase();
    const logged = await database
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.subjectId, german.id));
    expect(logged.map((row) => row.action)).toEqual(["entry.translated"]);
  });

  it("numbers the address of a new translation when the plain one is taken", async () => {
    const cookie = await signedInCookie();
    const rows = await list("post", cookie);
    const draft = rows.find((row) => row.title === "A draft");
    const german = rows.find((row) => row.language === "de");
    const database = await testDatabase();
    await database
      .insert(paths)
      .values({ translationId: german?.id ?? "", path: "/de/a-draft/", isCurrent: false });

    const response = await app.request(`/entries/${draft?.id}/translation`, {
      method: "POST",
      headers: { cookie },
    });
    expect(entryDetail.parse(((await response.json()) as { data: unknown }).data).path).toBe(
      "/de/a-draft-2/",
    );
  });

  it("answers not found when asked to translate a translation that does not exist", async () => {
    const response = await app.request("/entries/0199f064-43b7-79a8-917f-eefc8c852400/translation", {
      method: "POST",
      headers: { cookie: await signedInCookie() },
    });
    expect(response.status).toBe(404);
  });

  it("refuses a request without a session", async () => {
    const response = await app.request("/entries?kind=post");
    expect(response.status).toBe(401);
  });

  it("refuses a kind it does not know and a parameter it did not ask for", async () => {
    const cookie = await signedInCookie();
    for (const query of ["kind=draft", "kind=post&owner=me", ""]) {
      const response = await app.request(`/entries?${query}`, { headers: { cookie } });
      expect(response.status).toBe(400);
      expect(readApiError(await response.json())?.code).toBe("invalid_request");
    }
  });
});
