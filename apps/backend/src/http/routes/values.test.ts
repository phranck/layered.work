import { DEFAULT_LISTING, namedValue, namedValueList, readApiError } from "@layered/schemas";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { readPublicSnapshot } from "../../content/snapshot.js";
import { auditLog, entryTranslations } from "../../db/schema/index.js";
import { closeTestDatabase, hasTestDatabase, testDatabase } from "../../test-support/database.js";
import { OWNER, seedEditorialLibrary, signedInCookie } from "../../test-support/editorial.js";
import { app } from "../app.js";

/**
 * The named values, against the real database, with the library described in
 * `test-support/editorial.ts`.
 */

const runs = hasTestDatabase ? describe : describe.skip;

function send(method: string, path: string, cookie: string, value?: unknown) {
  return app.request(`/values${path}`, {
    method,
    headers: { cookie, "content-type": "application/json" },
    ...(value === undefined ? {} : { body: JSON.stringify(value) }),
  });
}

async function create(cookie: string, name: string, value: string) {
  const response = await send("POST", "", cookie, { name, value });
  expect(response.status).toBe(200);
  return namedValue.parse(((await response.json()) as { data: unknown }).data);
}

async function list(cookie: string) {
  const response = await send("GET", "", cookie);
  expect(response.status).toBe(200);
  return namedValueList.parse(((await response.json()) as { data: unknown }).data);
}

/** Writes a body into one of the library's translations, by its title. */
async function writeBody(title: string, body: string) {
  const database = await testDatabase();
  await database.update(entryTranslations).set({ body }).where(eq(entryTranslations.title, title));
}

runs("the named values", () => {
  afterAll(async () => {
    await closeTestDatabase();
  });

  beforeEach(async () => {
    await seedEditorialLibrary();
  });

  it("lets the owner add, change and list values, and audits each change by name", async () => {
    const cookie = await signedInCookie(OWNER);
    const product = await create(cookie, "product", "Velvet");
    const changed = await send("PUT", `/${product.id}`, cookie, { value: "Velvet 2" });
    expect(changed.status).toBe(200);

    expect(await list(await signedInCookie())).toEqual([
      { id: product.id, name: "product", value: "Velvet 2", usedBy: [] },
    ]);
    const audited = await (await testDatabase())
      .select({ action: auditLog.action, detail: auditLog.detail })
      .from(auditLog)
      .where(like(auditLog.action, "named_value.%"));
    expect(audited).toEqual([
      { action: "named_value.created", detail: { name: "product" } },
      { action: "named_value.updated", detail: { name: "product" } },
    ]);
  });

  it("refuses a second value of the same name as a conflict", async () => {
    const cookie = await signedInCookie(OWNER);
    await create(cookie, "product", "Velvet");
    const response = await send("POST", "", cookie, { name: "product", value: "Other" });
    expect(response.status).toBe(409);
    expect(readApiError(await response.json())?.code).toBe("conflict");
  });

  it("refuses a name or a text outside what a value may be", async () => {
    const cookie = await signedInCookie(OWNER);
    for (const value of [
      { name: "Product", value: "Velvet" },
      { name: "two words", value: "Velvet" },
      { name: "-product", value: "Velvet" },
      { name: "a".repeat(49), value: "Velvet" },
      { name: "product", value: "   " },
      { name: "product", value: "two\nlines" },
      { name: "product", value: "Velvet", extra: true },
    ]) {
      const response = await send("POST", "", cookie, value);
      expect(response.status, JSON.stringify(value)).toBe(400);
    }
  });

  it("lets only the owner change values, and nobody without a session read them", async () => {
    const owner = await signedInCookie(OWNER);
    const product = await create(owner, "product", "Velvet");
    const editor = await signedInCookie();
    expect((await send("POST", "", editor, { name: "other", value: "x" })).status).toBe(403);
    expect((await send("PUT", `/${product.id}`, editor, { value: "x" })).status).toBe(403);
    expect((await send("DELETE", `/${product.id}`, editor)).status).toBe(403);
    expect((await send("GET", "", "")).status).toBe(401);
  });

  it("names where a value is used, and refuses to delete it while anything refers to it", async () => {
    const cookie = await signedInCookie(OWNER);
    const product = await create(cookie, "product", "Velvet");
    await writeBody("A draft", "Built with {{ product }}.");
    await writeBody("A page", "`{{ product }}` is how a reference is written.");
    const projects = { ...DEFAULT_LISTING, introduction: { en: "", de: "Alles mit {{ product }}." } };
    expect(
      (
        await app.request("/settings/projectListing", {
          method: "PUT",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify(projects),
        })
      ).status,
    ).toBe(200);

    const [read] = await list(cookie);
    expect(read?.usedBy).toEqual([
      { kind: "entry", entryId: expect.any(String), title: "A draft" },
      { kind: "listing", listing: "project" },
    ]);

    const refused = await send("DELETE", `/${product.id}`, cookie);
    expect(refused.status).toBe(409);
    expect(readApiError(await refused.json())?.message).toBe("This value is still used in 2 places.");

    await writeBody("A draft", "Built with Velvet.");
    await app.request("/settings/projectListing", {
      method: "PUT",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(DEFAULT_LISTING),
    });
    expect((await send("DELETE", `/${product.id}`, cookie)).status).toBe(200);
    expect(await list(cookie)).toEqual([]);
  });

  it("hands the site bodies and introductions with every reference replaced, as text", async () => {
    const cookie = await signedInCookie(OWNER);
    await create(cookie, "product", "*Velvet*");
    await writeBody("A page", "Made with {{ product }}, not `{{ product }}`.");
    await app.request("/settings/postListing", {
      method: "PUT",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ ...DEFAULT_LISTING, introduction: { en: "All about {{product}}.", de: "" } }),
    });

    const snapshot = await readPublicSnapshot(await testDatabase());
    expect(snapshot.entries.find((entry) => entry.title === "A page")?.body).toBe(
      "Made with \\*Velvet\\*, not `{{ product }}`.",
    );
    expect(snapshot.listings.post.introduction.en).toBe("All about \\*Velvet\\*.");
  });

  it("refuses to publish a body that refers to a name no value has, and publishes one that refers to a value", async () => {
    const cookie = await signedInCookie(OWNER);
    await create(cookie, "product", "Velvet");
    const [page] = await (await testDatabase())
      .select({ id: entryTranslations.id })
      .from(entryTranslations)
      .where(eq(entryTranslations.title, "A page"));
    const save = (body: string) =>
      app.request(`/entries/${page?.id}`, {
        method: "PUT",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          title: "A page",
          summary: null,
          body,
          state: "public",
          readingWidth: "normal",
          showInOtherLanguage: false,
          topicIds: [],
          specs: [],
          slug: "a-page",
        }),
      });

    const refused = await save("Made with {{ prodcut }}.");
    expect(refused.status).toBe(400);
    expect(readApiError(await refused.json())?.message).toContain("unknown-value at 1:11");
    expect((await save("Made with {{ product }}.")).status).toBe(200);
  });

  it("finds a public entry by the text of a value its body refers to", async () => {
    const cookie = await signedInCookie(OWNER);
    await create(cookie, "product", "Velvetphone");
    await writeBody("A page", "Made with {{ product }}.");
    const response = await app.request(
      `/content/search?${new URLSearchParams({ q: "Velvetphone", language: "en" })}`,
    );
    expect(response.status).toBe(200);
    expect(
      ((await response.json()) as { entries: { title: string }[] }).entries.map((entry) => entry.title),
    ).toEqual(["A page"]);
  });
});
