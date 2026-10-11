import {
  DEFAULT_LISTING,
  DEFAULT_SETTINGS,
  readApiError,
  type SettingsView,
  settingsView,
} from "@layered/schemas";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { readPublicSnapshot } from "../../content/snapshot.js";
import { auditLog, media, mediaJobs, settings } from "../../db/schema/index.js";
import { getMediaUses } from "../../media/library.js";
import { closeTestDatabase, hasTestDatabase, testDatabase } from "../../test-support/database.js";
import { OWNER, seedEditorialLibrary, signedInCookie } from "../../test-support/editorial.js";
import { app } from "../app.js";

/**
 * The site's settings, against the real database, with the library described
 * in `test-support/editorial.ts`. The suite runs without an SMTP2GO key, so it
 * proves what happens when none is configured; what SMTP2GO answers is tested
 * in `mail/smtp2go.test.ts`.
 */

const runs = hasTestDatabase ? describe : describe.skip;

const site = {
  title: { en: "LAYERED.work", de: "LAYERED.work" },
  footerLine: { en: "Made in Bregenz.", de: "Gemacht in Bregenz." },
  defaultLanguage: "de",
  socialImageMediaId: null,
};

async function read(cookie: string): Promise<SettingsView> {
  const response = await app.request("/settings", { headers: { cookie } });
  expect(response.status).toBe(200);
  return settingsView.parse(((await response.json()) as { data: unknown }).data);
}

function put(path: string, value: unknown, cookie: string) {
  return app.request(`/settings/${path}`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(value),
  });
}

runs("the site's settings", () => {
  afterAll(async () => {
    await closeTestDatabase();
  });

  beforeEach(async () => {
    await seedEditorialLibrary();
  });

  it("reads as the defaults before anybody saved them, and says the mail key is absent", async () => {
    const view = await read(await signedInCookie());
    expect(view.site).toMatchObject(DEFAULT_SETTINGS.site);
    expect(view.analytics).toEqual(DEFAULT_SETTINGS.analytics);
    expect(view.mail).toEqual({ ...DEFAULT_SETTINGS.mail, apiKeyConfigured: false });
  });

  it("lets the owner save a group and records which values changed, but not what they are", async () => {
    const cookie = await signedInCookie(OWNER);
    const response = await put("site", site, cookie);
    expect(response.status).toBe(200);
    expect((await read(cookie)).site).toMatchObject(site);

    const database = await testDatabase();
    const entries = await database.select().from(auditLog).where(eq(auditLog.action, "settings.updated"));
    expect(entries).toHaveLength(1);
    expect(entries[0]?.detail).toEqual({ group: "site", changedKeys: ["footerLine", "defaultLanguage"] });
    expect(JSON.stringify(entries[0]?.detail)).not.toContain("Bregenz");
  });

  it("refuses a change from an author who is not the owner", async () => {
    const response = await put("analytics", { umamiWebsiteId: null }, await signedInCookie());
    expect(response.status).toBe(403);
    expect(readApiError(await response.json())?.code).toBe("forbidden");
  });

  it("refuses a value its declaration does not allow, with the reason", async () => {
    const cookie = await signedInCookie(OWNER);
    const refused = [
      await put("mail", { senderAddress: "hello@layered.work", senderName: 'Evil" <x@y.z>\r\nBcc:' }, cookie),
      await put("mail", { senderAddress: "not an address", senderName: "LAYERED.work" }, cookie),
      await put("analytics", { umamiWebsiteId: "not-a-uuid" }, cookie),
      await put("site", { ...site, defaultLanguage: "fr" }, cookie),
      await put("site", { ...site, owner: "me" }, cookie),
    ];
    for (const response of refused) {
      expect(response.status).toBe(400);
      expect(readApiError(await response.json())?.code).toBe("invalid_request");
    }
  });

  it("takes a raster picture from the library for the social card and refuses anything else", async () => {
    const cookie = await signedInCookie(OWNER);
    const database = await testDatabase();
    const files = await database.select({ id: media.id, slug: media.slug }).from(media);
    const picture = files.find((file) => file.slug === "soldering-iron")?.id;
    const document = files.find((file) => file.slug === "schematic-sheet")?.id;

    expect((await put("site", { ...site, socialImageMediaId: document }, cookie)).status).toBe(400);
    expect((await put("site", { ...site, socialImageMediaId: picture }, cookie)).status).toBe(200);
    expect((await read(cookie)).site.socialImageMediaId).toBe(picture);
  });

  it("keeps a site group stored before the watermark setting existed, instead of falling back to the defaults", async () => {
    const database = await testDatabase();
    await database
      .insert(settings)
      .values({ key: "site", value: site })
      .onConflictDoUpdate({ target: settings.key, set: { value: site } });
    const view = await read(await signedInCookie());
    expect(view.site.footerLine).toEqual(site.footerLine);
    expect(view.site.watermarkMediaId).toBeNull();
  });

  it("takes a raster picture for the watermark, counts it as a use, and derives every marked picture again", async () => {
    const cookie = await signedInCookie(OWNER);
    const database = await testDatabase();
    const files = await database.select({ id: media.id, slug: media.slug }).from(media);
    const mark = files.find((file) => file.slug === "soldering-iron")?.id as string;
    const document = files.find((file) => file.slug === "schematic-sheet")?.id;
    // The library holds one raster picture, so it is both the mark and a marked picture.
    const marked = mark;
    await database.update(media).set({ watermark: "bottom-right" }).where(eq(media.id, marked));
    await database
      .insert(mediaJobs)
      .values({ mediaId: marked, state: "ready" })
      .onConflictDoUpdate({ target: mediaJobs.mediaId, set: { state: "ready" } });

    expect((await put("site", { ...site, watermarkMediaId: document }, cookie)).status).toBe(400);
    expect((await put("site", { ...site, watermarkMediaId: mark }, cookie)).status).toBe(200);
    expect((await read(cookie)).site.watermarkMediaId).toBe(mark);
    const [job] = await database.select().from(mediaJobs).where(eq(mediaJobs.mediaId, marked));
    expect(job?.state).toBe("queued");
    expect((await getMediaUses(database, mark)).map((use) => use.title)).toContain("Site watermark");
  });

  it("refuses a test message whilst no SMTP2GO key is configured, and only the owner may ask", async () => {
    const editor = await app.request("/settings/mail/test", {
      method: "POST",
      headers: { cookie: await signedInCookie() },
    });
    expect(editor.status).toBe(403);

    const owner = await app.request("/settings/mail/test", {
      method: "POST",
      headers: { cookie: await signedInCookie(OWNER) },
    });
    expect(owner.status).toBe(409);
    expect(readApiError(await owner.json())?.message).toMatch(/No SMTP2GO key/);
  });

  it("stores how each overview is set up, apart from the other, and hands both to the site", async () => {
    const cookie = await signedInCookie(OWNER);
    const projects = {
      ...DEFAULT_LISTING,
      pageSize: 9,
      columns: 2,
      headline: { en: "Work", de: "" },
      introduction: { en: "Random selection of some of my projects.", de: "" },
    };
    expect((await put("projectListing", projects, cookie)).status).toBe(200);

    const view = await read(cookie);
    expect(view.projectListing).toEqual(projects);
    expect(view.postListing).toEqual(DEFAULT_LISTING);

    const snapshot = await readPublicSnapshot(await testDatabase());
    expect(snapshot.listings).toEqual({ post: DEFAULT_LISTING, project: projects });
  });

  it("refuses an overview the bounds do not allow", async () => {
    const cookie = await signedInCookie(OWNER);
    for (const change of [
      { pageSize: 0 },
      { pageSize: 61 },
      { columns: 5 },
      { previewLength: 10 },
      { headline: { en: "Posts" } },
    ]) {
      const response = await put("postListing", { ...DEFAULT_LISTING, ...change }, cookie);
      expect(response.status).toBe(400);
    }
    expect((await put("postListing", DEFAULT_LISTING, await signedInCookie())).status).toBe(403);
  });

  it("refuses everything without a session", async () => {
    expect((await app.request("/settings")).status).toBe(401);
    expect((await put("site", site, "")).status).toBe(401);
  });
});
