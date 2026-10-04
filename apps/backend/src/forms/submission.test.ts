import { randomUUID } from "node:crypto";
import { ErrorCode, validateFormValues } from "@layered/schemas";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDatabase } from "../db/connect.js";
import { auditLog, formSubmissions, forms, users } from "../db/schema/index.js";
import { app } from "../http/app.js";
import { forgetRateLimits } from "../http/rate-limit.js";
import { closeTestDatabase, hasTestDatabase, testDatabase } from "../test-support/database.js";
import { issueFormChallenge, verifyFormChallenge } from "./challenge.js";
import { createForm } from "./repository.js";

const suffix = randomUUID();
const slug = `submit-${suffix}`;
const runs = hasTestDatabase ? describe : describe.skip;
let actorId = "";
let formId = "";
const declaration = {
  slug,
  name: "Submission test",
  notificationEmail: null,
  successMessage: { en: "Received", de: "Erhalten" },
  storeSubmissions: true,
  fields: [
    {
      key: "name",
      type: "shortText" as const,
      label: { en: "Name", de: "Name" },
      hint: { en: "", de: "" },
      required: true,
      minLength: 2,
      maxLength: 80,
      pattern: null,
    },
    {
      key: "consent",
      type: "consent" as const,
      label: { en: "Consent", de: "Einwilligung" },
      hint: { en: "", de: "" },
      required: true,
      notice: { en: "I agree", de: "Ich stimme zu" },
      revision: "v1",
    },
  ],
};

describe("signed form challenge", () => {
  it("requires the intended form and a human-length interval", () => {
    const now = 1_800_000_000_000;
    const token = issueFormChallenge("one", now);
    expect(verifyFormChallenge("one", token, now + 1_000)).toBe(false);
    expect(verifyFormChallenge("one", token, now + 2_000)).toBe(true);
    expect(verifyFormChallenge("two", token, now + 2_000)).toBe(false);
    expect(verifyFormChallenge("one", token, now + 3_600_001)).toBe(false);
  });
});

runs("public form submission", () => {
  beforeAll(async () => {
    const db = await testDatabase();
    const [actor] = await db
      .insert(users)
      .values({
        email: `submit-${suffix}@example.test`,
        passwordHash: "test-only",
        displayName: "Submit test",
      })
      .returning({ id: users.id });
    if (!actor) throw new Error("Test actor missing");
    actorId = actor.id;
    formId = (await createForm(db, declaration, actorId)).id;
  });

  afterAll(async () => {
    const db = await testDatabase();
    if (formId) {
      await db.delete(formSubmissions).where(eq(formSubmissions.formId, formId));
      await db.delete(auditLog).where(inArray(auditLog.subjectId, [formId]));
      await db.delete(forms).where(eq(forms.id, formId));
    }
    if (actorId) await db.delete(users).where(eq(users.id, actorId));
    forgetRateLimits();
    await closeDatabase();
    await closeTestDatabase();
  });

  it("refuses missing fields, then stores consent and limits a second submission", async () => {
    const base = `/forms/${slug}`;
    const challengeResponse = await app.request(`${base}/challenge`);
    expect(challengeResponse.status).toBe(200);
    expect(challengeResponse.headers.get("cache-control")).toBe("no-store");
    const challenge = issueFormChallenge(slug, Date.now() - 3_000);
    const send = (values: Record<string, string>) =>
      app.request(`${base}/submissions`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.1, 10.0.0.1" },
        body: JSON.stringify({ challenge, honeypot: "", language: "de", values }),
      });
    const missing = await send({ name: "", consent: "" });
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({
      fieldErrors: { name: expect.any(String), consent: expect.any(String) },
    });
    const accepted = await send({ name: " Ada ", consent: "yes" });
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toMatchObject({ data: { successMessage: "Erhalten" } });
    const again = await send({ name: "Ada", consent: "yes" });
    expect(again.status).toBe(429);
    expect(await again.json()).toMatchObject({ error: { code: ErrorCode.RateLimited } });
    const rows = await (await testDatabase())
      .select()
      .from(formSubmissions)
      .where(eq(formSubmissions.formId, formId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.values.name).toBe("Ada");
    expect(rows[0]?.consents).toEqual([{ key: "consent", revision: "v1", notice: "Ich stimme zu" }]);
    expect(rows[0]?.sourceHash).toMatch(/^[0-9a-f]{12}$/);
    expect(rows[0]?.sourceHash).not.toContain("198.51.100.1");
    expect(rows[0]?.status).toBe("unread");
  });

  it("rejects a filled honeypot and a forged challenge", async () => {
    const path = `/forms/${slug}/submissions`;
    for (const [challenge, honeypot] of [
      [issueFormChallenge(slug, Date.now() - 3_000), "bot"],
      ["forged", ""],
    ]) {
      const response = await app.request(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          challenge,
          honeypot,
          language: "en",
          values: { name: "Ada", consent: "yes" },
        }),
      });
      expect(response.status).toBe(400);
    }
  });
});

it("keeps submitted choices constrained to the declaration", () => {
  const form = {
    slug: "choices",
    name: "Choices",
    successMessage: { en: "Thanks", de: "Danke" },
    fields: [
      {
        key: "hardware",
        type: "multipleChoice" as const,
        label: { en: "Hardware", de: "Hardware" },
        hint: { en: "", de: "" },
        required: true,
        options: [
          { value: "pi", label: { en: "Pi", de: "Pi" } },
          { value: "nuc", label: { en: "NUC", de: "NUC" } },
        ],
      },
    ],
  };
  expect(validateFormValues(form, { hardware: ["pi", "unknown"] }, "en").errors.hardware).toBeTruthy();
  expect(validateFormValues(form, { hardware: [] }, "en").errors.hardware).toBeTruthy();
  expect(validateFormValues(form, { hardware: ["pi", "nuc"] }, "en").errors).toEqual({});
});
