import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SESSION_COOKIE } from "../../auth/cookie.js";
import { openSession } from "../../auth/session.js";
import { closeDatabase } from "../../db/connect.js";
import { sessions, users } from "../../db/schema/index.js";
import { DEFAULT_MAIL_TEMPLATES } from "../../mail/templates.js";
import { closeTestDatabase, hasTestDatabase, testDatabase } from "../../test-support/database.js";
import { app } from "../app.js";

const runs = hasTestDatabase ? describe : describe.skip;
let actorId = "";
let cookie = "";
const path = "/mail-templates/submission_confirmation";
const { name, subject, body } = DEFAULT_MAIL_TEMPLATES.submission_confirmation;
const template = { name, subject, body };

runs("mail template API", () => {
  beforeAll(async () => {
    const db = await testDatabase();
    const [actor] = await db
      .insert(users)
      .values({
        email: `mail-template-${randomUUID()}@example.test`,
        displayName: "Mail template test",
        passwordHash: "test-only",
        role: "owner",
      })
      .returning({ id: users.id });
    actorId = actor?.id ?? "";
    const session = await openSession(db, actorId, null);
    cookie = `${SESSION_COOKIE}=${session.cookieValue}`;
  });

  afterAll(async () => {
    const db = await testDatabase();
    if (actorId) {
      await db.delete(sessions).where(eq(sessions.userId, actorId));
      await db.delete(users).where(eq(users.id, actorId));
    }
    await closeDatabase();
    await closeTestDatabase();
  });

  it("serves both defaults and previews a draft with HTML and text", async () => {
    const list = await app.request("/mail-templates", { headers: { cookie } });
    expect(list.status).toBe(200);
    expect(((await list.json()) as { data: unknown }).data).toHaveLength(2);
    const preview = await app.request(`${path}/preview`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ template, language: "de" }),
    });
    expect(preview.status).toBe(200);
    const { data } = (await preview.json()) as { data: { text: string } };
    expect(data).toMatchObject({
      subject: expect.stringContaining("Contact"),
      text: expect.stringContaining("Vielen Dank"),
      html: expect.stringContaining("<strong>Contact</strong>"),
    });
    // The sample submission is dated as a real one is, in the preview's language.
    expect(data.text).toContain("5. Oktober 2026");
  });

  it("returns the unknown variable name and refuses an unconfigured live test send", async () => {
    const invalid = await app.request(`${path}/preview`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        template: { ...template, body: { ...body, en: "{{unknownName}}" } },
        language: "en",
      }),
    });
    expect(invalid.status).toBe(400);
    expect(((await invalid.json()) as { error: { message: string } }).error.message).toContain("unknownName");
    const live = await app.request(`${path}/test`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ template, language: "en", recipient: "reader@example.test" }),
    });
    expect(live.status).toBe(409);
  });
});
