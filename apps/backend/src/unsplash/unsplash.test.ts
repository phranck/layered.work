import { readApiError } from "@layered/schemas";
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const key = vi.hoisted(() => ({ value: "test-access-key" as string | undefined }));
vi.mock("../config.js", async (original) => {
  const actual = await original<typeof import("../config.js")>();
  return {
    ...actual,
    config: new Proxy(actual.config, {
      get: (target, property) =>
        property === "UNSPLASH_ACCESS_KEY" ? key.value : Reflect.get(target, property),
    }),
  };
});

import { publicMedia } from "../content/snapshot.js";
import { media, unsplashPhotos } from "../db/schema/index.js";
import { missingOriginalObjects } from "../db/verify-storage.js";
import { app } from "../http/app.js";
import { getMediaDetail, saveMediaMetadata } from "../media/library.js";
import { closeTestDatabase, hasTestDatabase, testDatabase } from "../test-support/database.js";
import { OWNER, seedEditorialLibrary, signedInCookie } from "../test-support/editorial.js";

/**
 * Unsplash in the media library, against the real database, with Unsplash's API
 * stood in for by a fetch that answers from the photos below and records every
 * request it was sent.
 */

const PHOTO = {
  id: "Dwu85P9SOIk",
  width: 4000,
  height: 2667,
  description: null,
  alt_description: "a soldering iron on a workbench",
  urls: {
    raw: "https://images.unsplash.com/photo-1?ixid=M3wxMjA3fDB8MXxhbGx8&ixlib=rb-4.0.3",
    small: "https://images.unsplash.com/photo-1?ixid=M3wxMjA3fDB8MXxhbGx8&w=400",
  },
  links: {
    download_location: "https://api.unsplash.com/photos/Dwu85P9SOIk/download?ixid=M3wxMjA3fDB8MXxhbGx8",
  },
  user: { name: "Jane Doe", links: { html: "https://unsplash.com/@janedoe" } },
};

let requests: { url: string; authorization: string | null }[] = [];
let answer: (url: URL) => unknown = () => ({});

beforeEach(() => {
  requests = [];
  key.value = "test-access-key";
  answer = (url) =>
    url.pathname === "/search/photos"
      ? { total: 31, total_pages: 2, results: [PHOTO] }
      : url.pathname.endsWith("/download")
        ? { url: "https://image.unsplash.com/example" }
        : PHOTO;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: URL | string, init?: RequestInit) => {
      const url = new URL(String(input));
      requests.push({ url: url.href, authorization: new Headers(init?.headers).get("authorization") });
      return new Response(JSON.stringify(answer(url)), { status: 200 });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const runs = hasTestDatabase ? describe : describe.skip;

runs("Unsplash in the media library", () => {
  const created: string[] = [];
  afterAll(async () => {
    const db = await testDatabase();
    if (created.length) await db.delete(media).where(inArray(media.id, created));
    await closeTestDatabase();
  });

  async function owner() {
    await seedEditorialLibrary();
    return signedInCookie(OWNER);
  }

  async function importPhoto(cookie: string) {
    const response = await app.request("/media/unsplash", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ photoId: PHOTO.id }),
    });
    const body = (await response.json()) as { data: { id: string; slug: string; existing: boolean } };
    if (response.status === 200) created.push(body.data.id);
    return { status: response.status, body };
  }

  it("searches through the API, with the key going to Unsplash and nowhere else", async () => {
    const cookie = await owner();
    const response = await app.request("/media/unsplash?query=soldering&page=1", { headers: { cookie } });
    expect(response.status).toBe(200);
    const { data } = (await response.json()) as { data: { items: unknown[]; hasMore: boolean } };
    expect(data.hasMore).toBe(true);
    expect(data.items).toEqual([
      {
        id: PHOTO.id,
        thumbnailUrl: PHOTO.urls.small,
        width: 4000,
        height: 2667,
        description: "a soldering iron on a workbench",
        photographer: "Jane Doe",
      },
    ]);
    expect(requests.map(({ url }) => new URL(url).origin)).toEqual(["https://api.unsplash.com"]);
    expect(requests[0]?.authorization).toBe("Client-ID test-access-key");
  });

  it("says Unsplash is not configured while no key is set, and asks nobody", async () => {
    const cookie = await owner();
    key.value = undefined;
    const response = await app.request("/media/unsplash?query=soldering", { headers: { cookie } });
    expect(response.status).toBe(409);
    expect(readApiError(await response.json())?.message).toMatch(/UNSPLASH_ACCESS_KEY/);
    expect(requests).toEqual([]);
  });

  it("refuses an answer whose picture address is not on Unsplash's image host", async () => {
    const cookie = await owner();
    answer = () => ({ ...PHOTO, urls: { ...PHOTO.urls, raw: "https://evil.example/photo-1" } });
    const { status } = await importPhoto(cookie);
    expect(status).toBe(500);
  });

  it("takes a photo into the library by its id, tells Unsplash, and finds it again the second time", async () => {
    const cookie = await owner();
    const first = await importPhoto(cookie);
    expect(first.status).toBe(200);
    expect(first.body.data.existing).toBe(false);
    expect(first.body.data.slug).toBe("a-soldering-iron-on-a-workbench");
    expect(requests.map(({ url }) => new URL(url).pathname)).toEqual([
      `/photos/${PHOTO.id}`,
      `/photos/${PHOTO.id}/download`,
    ]);
    expect(requests[1]?.url).toContain("ixid=");

    const db = await testDatabase();
    const [row] = await db
      .select()
      .from(unsplashPhotos)
      .where(eq(unsplashPhotos.mediaId, first.body.data.id));
    expect(row).toMatchObject({ photoId: PHOTO.id, imageUrl: PHOTO.urls.raw, photographerName: "Jane Doe" });

    requests = [];
    const second = await importPhoto(cookie);
    expect(second.body.data).toMatchObject({ id: first.body.data.id, existing: true });
    expect(requests.map(({ url }) => new URL(url).pathname)).toContain(`/photos/${PHOTO.id}/download`);
  });

  it("publishes the photo from Unsplash with its credit, and sends the dashboard there too", async () => {
    const cookie = await owner();
    const { body } = await importPhoto(cookie);
    const db = await testDatabase();
    const [published] = (await publicMedia(db, [{ body: "", featuredMediaId: body.data.id }])).media;
    expect(new URL(published?.src ?? "").hostname).toBe("images.unsplash.com");
    expect(new URL(published?.src ?? "").searchParams.get("ixid")).toBe("M3wxMjA3fDB8MXxhbGx8");
    expect(published?.srcSet?.split(", ").map((candidate) => candidate.split(" ")[1])).toEqual([
      "348w",
      "696w",
      "1180w",
      "2360w",
    ]);
    expect(published?.credit).toEqual({
      photographer: "Jane Doe",
      profileUrl: "https://unsplash.com/@janedoe",
    });
    expect((await getMediaDetail(db, body.data.id)).credit).toEqual(published?.credit);

    const content = await app.request(`/account/media/${body.data.id}/content`, { headers: { cookie } });
    expect(content.status).toBe(302);
    expect(new URL(content.headers.get("location") ?? "").hostname).toBe("images.unsplash.com");
  });

  it("refuses a watermark or a site picture role for a photo that has no bytes here, and never misses it in a store", async () => {
    const cookie = await owner();
    const { body } = await importPhoto(cookie);
    const db = await testDatabase();
    await expect(
      saveMediaMetadata(db, body.data.id, {
        focalPoint: { x: 0.5, y: 0.5 },
        translations: [
          { language: "en", altText: null, caption: null },
          { language: "de", altText: null, caption: null },
        ],
        watermark: "center",
      }),
    ).rejects.toThrow(/uploaded here/);

    const site = {
      title: { en: "LAYERED.work", de: "LAYERED.work" },
      footerLine: { en: "", de: "" },
      defaultLanguage: "en",
      socialImageMediaId: null,
    };
    for (const change of [{ socialImageMediaId: body.data.id }, { watermarkMediaId: body.data.id }]) {
      const response = await app.request("/settings/site", {
        method: "PUT",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ ...site, ...change }),
      });
      expect(response.status).toBe(400);
    }

    const missing = await missingOriginalObjects(db, async () => false);
    expect(missing.map(({ storageKey }) => storageKey)).not.toContain(`unsplash/${PHOTO.id}`);
  });
});
