import { DEFAULT_SETTINGS, readApiError, type SettingsView, settingsView } from "@layered/schemas";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { auditLog, media } from "../../db/schema/index.js";
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
    expect((await read(cookie)).site.socialImageUrl).toBe(`/api/account/media/${picture}/content`);
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

  it("refuses everything without a session", async () => {
    expect((await app.request("/settings")).status).toBe(401);
    expect((await put("site", site, "")).status).toBe(401);
  });
});
