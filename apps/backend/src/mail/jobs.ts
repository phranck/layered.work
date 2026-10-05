import { and, asc, eq, isNull, lte } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "../db/schema/index.js";
import { mailJobs } from "../db/schema/index.js";
import { logger } from "../logger.js";
import type { SendOutcome } from "./smtp2go.js";

type Database = PostgresJsDatabase<typeof schema>;
export type PendingMail = { to: string; subject: string; text: string; html?: string };
type Sender = (mail: PendingMail) => Promise<SendOutcome>;

const LEASE_MS = 60_000;
const BATCH_SIZE = 10;

/** Exponential retries cap at an hour; pending jobs remain durable until accepted. */
export function mailRetryDelay(attempts: number): number {
  return Math.min(3_600_000, 15_000 * 2 ** Math.min(attempts - 1, 8));
}

/** Claim one due job atomically, then send and record its outcome without private data in logs. */
export async function runMailJob(
  db: Database,
  jobId: string,
  send: Sender,
  now: Date = new Date(),
): Promise<"not_due" | "retry" | "sent"> {
  const [job] = await db
    .update(mailJobs)
    .set({ nextAttemptAt: new Date(now.getTime() + LEASE_MS) })
    .where(and(eq(mailJobs.id, jobId), isNull(mailJobs.sentAt), lte(mailJobs.nextAttemptAt, now)))
    .returning();
  if (!job) return "not_due";

  let accepted = false;
  let reason = "invalid_payload";
  if (job.recipient && job.body) {
    try {
      accepted = (
        await send({
          to: job.recipient,
          subject: job.subject,
          text: job.body,
          ...(job.htmlBody ? { html: job.htmlBody } : {}),
        })
      ).accepted;
      reason = "provider_refused";
    } catch {
      // A sender exception is retried like a provider refusal. Never log the
      // exception: external clients can put the recipient or body in its text.
      reason = "sender_exception";
    }
  }

  const attempts = job.attempts + 1;
  if (accepted) {
    await db
      .update(mailJobs)
      .set({ attempts, sentAt: now, recipient: null, body: null, htmlBody: null })
      .where(eq(mailJobs.id, job.id));
    logger.info({ jobId: job.id, submissionId: job.submissionId, attempts, result: "accepted" }, "mail job");
    return "sent";
  }

  const nextAttemptAt = new Date(now.getTime() + mailRetryDelay(attempts));
  await db.update(mailJobs).set({ attempts, nextAttemptAt }).where(eq(mailJobs.id, job.id));
  logger.warn(
    { jobId: job.id, submissionId: job.submissionId, attempts, nextAttemptAt, result: "retry", reason },
    "mail job",
  );
  return "retry";
}

/** Process a bounded batch, leaving the next batch for the following poll. */
export async function drainDueMailJobs(db: Database, send: Sender, now: Date = new Date()): Promise<number> {
  const jobs = await db
    .select({ id: mailJobs.id })
    .from(mailJobs)
    .where(and(isNull(mailJobs.sentAt), lte(mailJobs.nextAttemptAt, now)))
    .orderBy(asc(mailJobs.nextAttemptAt))
    .limit(BATCH_SIZE);
  for (const job of jobs) await runMailJob(db, job.id, send, now);
  return jobs.length;
}
