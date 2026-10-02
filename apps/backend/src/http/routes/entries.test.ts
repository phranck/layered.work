import { type EntryList, entryList, readApiError } from "@layered/schemas";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeTestDatabase, hasTestDatabase } from "../../test-support/database.js";
import { seedEditorialLibrary, signedInCookie } from "../../test-support/editorial.js";
import { app } from "../app.js";

/**
 * The entry list, against the real database, because what it answers is a
 * query: which rows, in which order, with which neighbour counted. The library
 * it reads is described in `test-support/editorial.ts`.
 */

const runs = hasTestDatabase ? describe : describe.skip;

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
