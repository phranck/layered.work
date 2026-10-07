import { type EntryList, entryList, entryPreview } from "@layered/schemas";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { namedValues } from "../../db/schema/index.js";
import {
  issuePreviewToken,
  PREVIEW_LIFETIME_MS,
  readPreview,
  readPreviewToken,
} from "../../entries/preview.js";
import { closeTestDatabase, hasTestDatabase, testDatabase } from "../../test-support/database.js";
import { seedEditorialLibrary, signedInCookie } from "../../test-support/editorial.js";
import { app } from "../app.js";

/**
 * Previews: what the editor holds, shown through a signed link that expires.
 *
 * The token tests need no database. The route tests run against the real one,
 * because what a preview answers is a query over a stored row.
 */

const ID = "0199f064-43b7-79a8-917f-eefc8c852400";

describe("a preview token", () => {
  it("names the preview it was issued for until it expires", () => {
    const token = issuePreviewToken(ID, 2_000);
    expect(readPreviewToken(token, 1_999)).toBe(ID);
    expect(readPreviewToken(token, 2_000)).toBeNull();
  });

  it("is refused when a single character of it changes", () => {
    const token = issuePreviewToken(ID, Date.now() + 60_000);
    const [payload, signature] = token.split(".");
    const flipped = `${payload}.${signature?.startsWith("A") ? "B" : "A"}${signature?.slice(1)}`;
    expect(readPreviewToken(flipped)).toBeNull();
    expect(readPreviewToken(`${token}.extra`)).toBeNull();
  });

  it("is refused when its last character is written another way that decodes the same", () => {
    const token = issuePreviewToken(ID, Date.now() + 60_000);
    const last = token.at(-1) ?? "A";
    // The last character of 32 bytes carries two bits nobody reads, so its
    // neighbour in the alphabet decodes to the same bytes.
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const sibling = alphabet[alphabet.indexOf(last) ^ 1] ?? "A";
    expect(readPreviewToken(`${token.slice(0, -1)}${sibling}`)).toBeNull();
  });

  it("is refused when it claims another purpose under a signature of its own", () => {
    const payload = Buffer.from(
      JSON.stringify({ purpose: "media-upload", previewId: ID, expiresAt: Date.now() + 60_000 }),
    ).toString("base64url");
    expect(
      readPreviewToken(`${payload}.${issuePreviewToken(ID, Date.now() + 60_000).split(".")[1]}`),
    ).toBeNull();
  });
});

const runs = hasTestDatabase ? describe : describe.skip;

runs("a preview", () => {
  afterAll(async () => {
    await closeTestDatabase();
  });

  beforeEach(async () => {
    await seedEditorialLibrary();
  });

  /** The first draft of the seeded library, which is what the editor would have open. */
  async function draftId(cookie: string): Promise<string> {
    const response = await app.request("/entries?kind=post", { headers: { cookie } });
    const rows: EntryList = entryList.parse(((await response.json()) as { data: unknown }).data);
    const draft = rows.find((row) => row.state === "draft");
    if (!draft) throw new Error("The seed has no draft.");
    return draft.id;
  }

  /** Asks for a preview of what the editor holds. */
  function ask(id: string, cookie?: string) {
    return app.request(`/entries/${id}/previews`, {
      method: "POST",
      headers: { ...(cookie ? { cookie } : {}), "content-type": "application/json" },
      body: JSON.stringify({
        title: "Unsaved title",
        summary: null,
        body: "Unsaved **text**.",
        readingWidth: "wide",
      }),
    });
  }

  it("shows the editor's unsaved text at its own address, uncached and unindexed", async () => {
    const cookie = await signedInCookie();
    const response = await ask(await draftId(cookie), cookie);
    expect(response.status).toBe(200);
    const { url, expiresAt } = entryPreview.parse(((await response.json()) as { data: unknown }).data);
    expect(url).toMatch(/\/preview\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\/$/);
    expect(Date.parse(expiresAt) - Date.now()).toBeGreaterThan(PREVIEW_LIFETIME_MS - 60_000);

    const token = new URL(url).pathname.split("/")[2] ?? "";
    const preview = await app.request(`/previews/${token}`);
    expect(preview.status).toBe(200);
    expect(preview.headers.get("cache-control")).toBe("no-store");
    expect(preview.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    const snapshot = (await preview.json()) as {
      entries: { title: string; body: string; visibility: string; readingWidth: string }[];
    };
    expect(snapshot.entries).toHaveLength(1);
    expect(snapshot.entries[0]).toMatchObject({
      title: "Unsaved title",
      body: "Unsaved **text**.",
      visibility: "hidden",
      readingWidth: "wide",
    });
  });

  it("shows a named value's text where the editor's text refers to it", async () => {
    await (await testDatabase()).insert(namedValues).values({ name: "product", value: "Velvet" });
    const cookie = await signedInCookie();
    const response = await app.request(`/entries/${await draftId(cookie)}/previews`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        title: "Unsaved title",
        summary: null,
        body: "Made with {{ product }}.",
        readingWidth: "normal",
      }),
    });
    const { url } = entryPreview.parse(((await response.json()) as { data: unknown }).data);
    const token = new URL(url).pathname.split("/")[2] ?? "";
    const snapshot = (await (await app.request(`/previews/${token}`)).json()) as {
      entries: { body: string }[];
    };
    expect(snapshot.entries[0]?.body).toBe("Made with Velvet.");
  });

  it("is gone once its time is up", async () => {
    const cookie = await signedInCookie();
    const { url } = entryPreview.parse(
      ((await (await ask(await draftId(cookie), cookie)).json()) as { data: unknown }).data,
    );
    const token = new URL(url).pathname.split("/")[2] ?? "";
    await expect(
      readPreview(await testDatabase(), token, Date.now() + PREVIEW_LIFETIME_MS + 1),
    ).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("answers one way for a forged token and refuses a malformed one", async () => {
    const forged = issuePreviewToken(ID, Date.now() + 60_000).replace(/.$/, (last) =>
      last === "A" ? "B" : "A",
    );
    expect((await app.request(`/previews/${forged}`)).status).toBe(404);
    expect((await app.request(`/previews/${issuePreviewToken(ID, Date.now() + 60_000)}`)).status).toBe(404);
    expect((await app.request("/previews/not-a-token")).status).toBe(400);
  });

  it("is made only with a session, for a translation that exists", async () => {
    const cookie = await signedInCookie();
    expect((await ask(await draftId(cookie))).status).toBe(401);
    expect((await ask(ID, cookie)).status).toBe(404);
  });
});
