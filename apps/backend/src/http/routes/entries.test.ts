import { hashPassword } from "@layered/passwords";
import { type EntryList, entryList, readApiError } from "@layered/schemas";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { SESSION_COOKIE } from "../../auth/cookie.js";
import { entries, entryTranslations, media, users } from "../../db/schema/index.js";
import {
  closeTestDatabase,
  emptyTestDatabase,
  hasTestDatabase,
  testDatabase,
} from "../../test-support/database.js";
import { app } from "../app.js";

/**
 * The entry list, against the real database, because what it answers is a
 * query: which rows, in which order, with which neighbour counted.
 */

const runs = hasTestDatabase ? describe : describe.skip;

const ACCOUNT = { email: "lister@layered.test", password: "a-password-for-listing" };

async function signedInCookie(): Promise<string> {
  const response = await app.request("/auth/sign-in", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(ACCOUNT),
  });
  const setCookie = response.headers.getSetCookie().find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));
  return setCookie?.split(";")[0] ?? "";
}

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
    const database = await testDatabase();
    await emptyTestDatabase();
    await database.insert(users).values({
      email: ACCOUNT.email,
      passwordHash: await hashPassword(ACCOUNT.password),
      displayName: "Lister",
      role: "editor",
    });

    const [picture, document] = await database
      .insert(media)
      .values([
        {
          slug: "list-picture",
          kind: "image",
          mimeType: "image/png",
          storageKey: "uploads/list-picture",
          byteSize: 10,
          checksum: "a".repeat(64),
          width: 40,
          height: 30,
        },
        {
          slug: "list-document",
          kind: "document",
          mimeType: "application/pdf",
          storageKey: "uploads/list-document",
          byteSize: 10,
          checksum: "b".repeat(64),
        },
      ])
      .returning({ id: media.id });

    const created = new Date("2026-01-01T00:00:00Z");
    const [pair, single, page] = await database
      .insert(entries)
      .values([
        { kind: "post", createdAt: created },
        { kind: "post", createdAt: created },
        { kind: "page", createdAt: created },
      ])
      .returning({ id: entries.id });

    await database.insert(entryTranslations).values([
      {
        entryId: pair?.id ?? "",
        language: "en",
        title: "Published in English",
        state: "public",
        publishedAt: new Date("2025-05-01T00:00:00Z"),
        featuredMediaId: picture?.id,
      },
      {
        entryId: pair?.id ?? "",
        language: "de",
        title: "Auf Deutsch versteckt",
        state: "hidden",
        publishedAt: new Date("2025-06-01T00:00:00Z"),
        featuredMediaId: document?.id,
      },
      { entryId: single?.id ?? "", language: "en", title: "A draft", state: "draft" },
      {
        entryId: page?.id ?? "",
        language: "en",
        title: "A page",
        state: "public",
        publishedAt: new Date("2024-01-01T00:00:00Z"),
      },
    ]);
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
