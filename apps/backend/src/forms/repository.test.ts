import { randomUUID } from "node:crypto";
import { ErrorCode } from "@layered/schemas";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, forms, users } from "../db/schema/index.js";
import { closeTestDatabase, hasTestDatabase, testDatabase } from "../test-support/database.js";
import { createForm, listForms, readForm, readFormBySlug, saveForm } from "./repository.js";

const runs = hasTestDatabase ? describe : describe.skip;
const suffix = randomUUID();
const slug = `form-${suffix}`;
let actorId = "";
const createdIds: string[] = [];

runs("form persistence", () => {
  beforeAll(async () => {
    const db = await testDatabase();
    const [actor] = await db
      .insert(users)
      .values({
        email: `form-test-${suffix}@example.test`,
        passwordHash: "test-only",
        displayName: "Form test",
      })
      .returning({ id: users.id });
    if (!actor) throw new Error("Test actor missing");
    actorId = actor.id;
  });

  afterAll(async () => {
    const db = await testDatabase();
    if (createdIds.length) {
      await db.delete(auditLog).where(inArray(auditLog.subjectId, createdIds));
      await db.delete(forms).where(inArray(forms.id, createdIds));
    }
    if (actorId) await db.delete(users).where(eq(users.id, actorId));
    await closeTestDatabase();
  });

  it("saves all fields and persists their reordered declaration", async () => {
    const db = await testDatabase();
    const first = {
      key: "name",
      label: { en: "Name", de: "Name" },
      hint: { en: "", de: "" },
      required: true,
      type: "shortText" as const,
      minLength: 1,
      maxLength: 80,
      pattern: null,
    };
    const second = {
      key: "email",
      label: { en: "Email", de: "E-Mail" },
      hint: { en: "", de: "" },
      required: true,
      type: "email" as const,
      minLength: 3,
      maxLength: 254,
      pattern: null,
    };
    const value = {
      slug,
      name: "Test form",
      notificationEmail: null,
      successMessage: { en: "Thanks", de: "Danke" },
      storeSubmissions: true,
      fields: [first, second],
    };
    const created = await createForm(db, value, actorId);
    createdIds.push(created.id);
    expect((await readForm(db, created.id)).fields.map((field) => field.key)).toEqual(["name", "email"]);
    const saved = await saveForm(db, created.id, { ...value, fields: [second, first] }, actorId);
    expect(saved.fields.map((field) => field.key)).toEqual(["email", "name"]);
    expect((await readFormBySlug(db, slug)).fields.map((field) => field.key)).toEqual(["email", "name"]);
    expect((await listForms(db)).some((form) => form.id === created.id)).toBe(true);
  });

  it("rejects a duplicate slug without replacing the existing declaration", async () => {
    const db = await testDatabase();
    await expect(
      createForm(
        db,
        {
          slug,
          name: "Duplicate",
          notificationEmail: null,
          successMessage: { en: "Thanks", de: "Danke" },
          storeSubmissions: true,
          fields: [
            {
              key: "name",
              label: { en: "Name", de: "Name" },
              hint: { en: "", de: "" },
              required: true,
              type: "shortText",
              minLength: 1,
              maxLength: 80,
              pattern: null,
            },
          ],
        },
        actorId,
      ),
    ).rejects.toMatchObject({ code: ErrorCode.Conflict });
    expect((await readFormBySlug(db, slug)).name).toBe("Test form");
  });
});
