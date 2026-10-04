import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mailJobs } from "../db/schema/index.js";
import { logger } from "../logger.js";
import { closeTestDatabase, hasTestDatabase, testDatabase } from "../test-support/database.js";
import { runMailJob } from "./jobs.js";

const runs = hasTestDatabase ? describe : describe.skip;
const now = new Date("2026-10-05T00:00:00.000Z");
let jobId = "";

runs("durable mail delivery", () => {
  beforeAll(async () => {
    const db = await testDatabase();
    const [job] = await db
      .insert(mailJobs)
      .values({
        recipient: "private@example.test",
        subject: "Contact form",
        body: "private message body",
        nextAttemptAt: now,
      })
      .returning({ id: mailJobs.id });
    jobId = job?.id ?? "";
  });

  afterAll(async () => {
    const db = await testDatabase();
    if (jobId) await db.delete(mailJobs).where(eq(mailJobs.id, jobId));
    await closeTestDatabase();
  });

  it("backs off after an outage, retries, then scrubs the private payload without logging it", async () => {
    const db = await testDatabase();
    const send = vi
      .fn()
      .mockResolvedValueOnce({ accepted: false, answer: "provider unavailable" })
      .mockResolvedValueOnce({ accepted: true, answer: "Accepted as abc." });
    const info = vi.spyOn(logger, "info");
    const warn = vi.spyOn(logger, "warn");

    expect(await runMailJob(db, jobId, send, now)).toBe("retry");
    expect(send).toHaveBeenCalledWith({
      to: "private@example.test",
      subject: "Contact form",
      text: "private message body",
    });
    const [delayed] = await db.select().from(mailJobs).where(eq(mailJobs.id, jobId));
    expect(delayed?.attempts).toBe(1);
    expect(delayed?.nextAttemptAt.toISOString()).toBe("2026-10-05T00:00:15.000Z");
    expect(await runMailJob(db, jobId, send, now)).toBe("not_due");
    expect(send).toHaveBeenCalledTimes(1);

    expect(await runMailJob(db, jobId, send, new Date("2026-10-05T00:00:15.000Z"))).toBe("sent");
    const [accepted] = await db.select().from(mailJobs).where(eq(mailJobs.id, jobId));
    expect(accepted?.attempts).toBe(2);
    expect(accepted?.sentAt?.toISOString()).toBe("2026-10-05T00:00:15.000Z");
    expect(accepted?.recipient).toBeNull();
    expect(accepted?.body).toBeNull();
    expect(await runMailJob(db, jobId, send, new Date("2026-10-05T00:01:00.000Z"))).toBe("not_due");
    expect(send).toHaveBeenCalledTimes(2);

    const logged = JSON.stringify([...info.mock.calls, ...warn.mock.calls]);
    expect(logged).toContain(jobId);
    expect(logged).not.toContain("private@example.test");
    expect(logged).not.toContain("private message body");
    info.mockRestore();
    warn.mockRestore();
  });
});
