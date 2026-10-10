import {
  type CreateFormBody,
  FORM_SUBMISSION_STATUSES,
  type FormConsent,
  type FormSubmissionValues,
} from "@layered/schemas";
import { jsonb, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { identifier, instant } from "./columns.js";

export const formSubmissionStatus = pgEnum("form_submission_status", FORM_SUBMISSION_STATUSES);

/** One editable declaration. Its JSON contains field order and both languages. */
export const forms = pgTable("forms", {
  id: identifier(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  declaration: jsonb().$type<CreateFormBody>().notNull(),
  createdAt: instant("created_at"),
  modifiedAt: instant("modified_at"),
});

/** Each accepted submission preserves the values and the exact consent text. */
export const formSubmissions = pgTable("form_submissions", {
  id: identifier(),
  formId: uuid("form_id")
    .notNull()
    .references(() => forms.id),
  values: jsonb().$type<FormSubmissionValues>().notNull(),
  consents: jsonb().$type<FormConsent[]>().notNull(),
  sourceHash: text("source_hash"),
  status: formSubmissionStatus().notNull().default("unread"),
  createdAt: instant("created_at"),
});
