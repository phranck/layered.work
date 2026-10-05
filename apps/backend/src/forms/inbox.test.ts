import { randomUUID } from "node:crypto";
import { ErrorCode } from "@layered/schemas";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SESSION_COOKIE } from "../auth/cookie.js";
import { openSession } from "../auth/session.js";
import { closeDatabase } from "../db/connect.js";
import { auditLog, formSubmissions, forms, sessions, users } from "../db/schema/index.js";
import { app } from "../http/app.js";
import { closeTestDatabase, hasTestDatabase, testDatabase } from "../test-support/database.js";
import { createForm } from "./repository.js";

const runs = hasTestDatabase ? describe : describe.skip;
const suffix = randomUUID();
let actorId = "";
let formId = "";
let firstId = "";
let secondId = "";
let cookie = "";

runs("form submissions inbox", () => {
  beforeAll(async () => {
    const db = await testDatabase();
    const [actor] = await db
      .insert(users)
      .values({ email: `inbox-${suffix}@example.test`, passwordHash: "test-only", displayName: "Inbox test" })
      .returning({ id: users.id });
    if (!actor) throw new Error("Test actor missing");
    actorId = actor.id;
    formId = (
      await createForm(
        db,
        {
          slug: `inbox-${suffix}`,
          name: "Contact",
          notificationEmail: null,
          storeSubmissions: true,
          successMessage: { en: "Thanks", de: "Danke" },
          fields: [
            {
              key: "message",
              type: "longText",
              label: { en: "Message", de: "Nachricht" },
              hint: { en: "", de: "" },
              required: true,
              minLength: 1,
              maxLength: 2000,
              pattern: null,
            },
          ],
        },
        actorId,
      )
    ).id;
    cookie = `${SESSION_COOKIE}=${(await openSession(db, actorId, null)).cookieValue}`;
    const rows = await db
      .insert(formSubmissions)
      .values([
        {
          formId,
          values: { message: "<img src=x onerror=alert(1)>" },
          consents: [],
          sourceHash: "a".repeat(12),
          createdAt: new Date("2026-10-03T12:00:00.000Z"),
        },
        {
          formId,
          values: { message: "=MÜLLER;Österreich\nzweite Zeile" },
          consents: [],
          sourceHash: "b".repeat(12),
          createdAt: new Date("2026-10-03T13:00:00.000Z"),
        },
      ])
      .returning({ id: formSubmissions.id });
    firstId = rows[0]?.id ?? "";
    secondId = rows[1]?.id ?? "";
  });

  afterAll(async () => {
    const db = await testDatabase();
    if (formId) {
      await db.delete(formSubmissions).where(eq(formSubmissions.formId, formId));
      await db.delete(auditLog).where(inArray(auditLog.subjectId, [formId, firstId, secondId]));
      await db.delete(forms).where(eq(forms.id, formId));
    }
    if (actorId) {
      await db.delete(sessions).where(eq(sessions.userId, actorId));
      await db.delete(users).where(eq(users.id, actorId));
    }
    await closeDatabase();
    await closeTestDatabase();
  });

  it("requires a session and lists newest submissions with text values and a coarse origin", async () => {
    const path = `/forms/${formId}/submissions`;
    const refused = await app.request(path);
    expect(refused.status).toBe(401);
    expect(await refused.json()).toMatchObject({ error: { code: ErrorCode.Unauthenticated } });

    const response = await app.request(path, { headers: { cookie } });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: [
        {
          id: secondId,
          status: "unread",
          sourceHash: "b".repeat(12),
          values: { message: "=MÜLLER;Österreich\nzweite Zeile" },
        },
        {
          id: firstId,
          status: "unread",
          sourceHash: "a".repeat(12),
          values: { message: "<img src=x onerror=alert(1)>" },
        },
      ],
    });
  });

  it("counts unread messages and removes read and spam entries from the sidebar count", async () => {
    const counts = () => app.request("/dashboard/counts", { headers: { cookie } });
    const before = (await (await counts()).json()) as { data: { submissions: number } };
    expect(before.data.submissions).toBe(2);

    const read = await app.request(`/forms/${formId}/submissions/${firstId}`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ status: "read" }),
    });
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({ data: { id: firstId, status: "read" } });

    const spam = await app.request(`/forms/${formId}/submissions/${secondId}`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ status: "spam" }),
    });
    expect(spam.status).toBe(200);
    const after = (await (await counts()).json()) as { data: { submissions: number } };
    expect(after.data.submissions).toBe(0);
  });

  it("exports spreadsheet-safe UTF-8 CSV and only deletes the named submission", async () => {
    const exportResponse = await app.request(`/forms/${formId}/submissions/export`, { headers: { cookie } });
    expect(exportResponse.status).toBe(200);
    expect(exportResponse.headers.get("content-type")).toContain("text/csv");
    expect([...new Uint8Array(await exportResponse.clone().arrayBuffer()).slice(0, 3)]).toEqual([
      239, 187, 191,
    ]);
    const csv = await exportResponse.text();
    expect(csv).toContain("Österreich");
    expect(csv).toContain("'=MÜLLER;Österreich");
    expect(csv).toContain("<img src=x onerror=alert(1)>");

    const removed = await app.request(`/forms/${formId}/submissions/${firstId}`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(removed.status).toBe(200);
    const rows = await (await testDatabase())
      .select({ id: formSubmissions.id })
      .from(formSubmissions)
      .where(eq(formSubmissions.formId, formId));
    expect(rows).toEqual([{ id: secondId }]);
  });
});
