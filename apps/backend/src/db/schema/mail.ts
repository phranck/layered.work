import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { identifier, instant } from "./columns.js";
import { formSubmissions, forms } from "./forms.js";

/** Durable outgoing mail; the recipient and body are erased after acceptance. */
export const mailJobs = pgTable(
  "mail_jobs",
  {
    id: identifier(),
    formId: uuid("form_id").references(() => forms.id, { onDelete: "set null" }),
    submissionId: uuid("submission_id").references(() => formSubmissions.id, { onDelete: "cascade" }),
    recipient: text(),
    subject: text().notNull(),
    body: text(),
    htmlBody: text("html_body"),
    attempts: integer().notNull().default(0),
    nextAttemptAt: instant("next_attempt_at"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: instant("created_at"),
  },
  (table) => [index("mail_jobs_due").on(table.sentAt, table.nextAttemptAt)],
);
