import { readApiError, type SearchResults, searchResults } from "@layered/schemas";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeTestDatabase, hasTestDatabase } from "../../test-support/database.js";
import { seedEditorialLibrary, signedInCookie } from "../../test-support/editorial.js";
import { app } from "../app.js";

/**
 * Searching across entries and media, against the library described in
 * `test-support/editorial.ts`.
 */

const runs = hasTestDatabase ? describe : describe.skip;

async function search(text: string, cookie: string): Promise<SearchResults> {
  const response = await app.request(`/search?${new URLSearchParams({ q: text })}`, { headers: { cookie } });
  expect(response.status).toBe(200);
  return searchResults.parse(((await response.json()) as { data: unknown }).data);
}

runs("the dashboard's search", () => {
  afterAll(async () => {
    await closeTestDatabase();
  });

  beforeEach(async () => {
    await seedEditorialLibrary();
  });

  it("finds an entry by a word in its title, whatever the case", async () => {
    const found = await search("DEUTSCH", await signedInCookie());
    expect(found.entries.map((hit) => hit.title)).toEqual(["Auf Deutsch versteckt"]);
  });

  it("finds both languages of an entry by its topic, in either language's name", async () => {
    const cookie = await signedInCookie();
    for (const text of ["retro computing", "Retro-Computer"]) {
      const found = await search(text, cookie);
      expect(found.entries.map((hit) => hit.title).sort()).toEqual([
        "Auf Deutsch versteckt",
        "Published in English",
      ]);
    }
  });

  it("finds a file by its slug and by its alt text, and says which alt text it has", async () => {
    const cookie = await signedInCookie();
    const bySlug = await search("schematic", cookie);
    expect(bySlug.media).toEqual([expect.objectContaining({ slug: "schematic-sheet", thumbnailUrl: null })]);

    const byAlt = await search("on the bench", cookie);
    expect(byAlt.media).toEqual([
      expect.objectContaining({ slug: "soldering-iron", altText: "A soldering iron on the bench" }),
    ]);
    expect(byAlt.media[0]?.thumbnailUrl).toMatch(/^\/api\/account\/media\/[0-9a-f-]{36}\/content$/);
  });

  it("finds entries and files with the same word, and names the kind of each entry", async () => {
    const found = await search("solder", await signedInCookie());
    expect(found.entries).toEqual([
      expect.objectContaining({ title: "A draft", kind: "post", state: "draft" }),
    ]);
    expect(found.media.map((hit) => hit.slug)).toEqual(["soldering-iron"]);
  });

  it("takes a wildcard character as itself", async () => {
    const found = await search("%", await signedInCookie());
    expect(found).toEqual({ entries: [], media: [] });
  });

  it("refuses an empty search, an overlong one and one without a session", async () => {
    const cookie = await signedInCookie();
    for (const text of ["", "   ", "x".repeat(301)]) {
      const response = await app.request(`/search?${new URLSearchParams({ q: text })}`, {
        headers: { cookie },
      });
      expect(response.status).toBe(400);
      expect(readApiError(await response.json())?.code).toBe("invalid_request");
    }
    expect((await app.request("/search?q=pi")).status).toBe(401);
  });
});
