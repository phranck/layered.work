import { ErrorCode, type FormSubmission, type FormSubmissionStatus } from "@layered/schemas";
import { and, desc, eq } from "drizzle-orm";
import type { database } from "../db/connect.js";
import { auditLog, formSubmissions } from "../db/schema/index.js";
import { HttpError } from "../http/response.js";
import { readForm } from "./repository.js";

type Database = ReturnType<typeof database>;
type SubmissionRow = typeof formSubmissions.$inferSelect;

function view(row: SubmissionRow): FormSubmission {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

/** Only responses to this form, newest first; the declaration is checked first. */
export async function listFormSubmissions(db: Database, formId: string): Promise<FormSubmission[]> {
  await readForm(db, formId);
  const rows = await db
    .select()
    .from(formSubmissions)
    .where(eq(formSubmissions.formId, formId))
    .orderBy(desc(formSubmissions.createdAt), desc(formSubmissions.id));
  return rows.map(view);
}

/** One state change and its audit record succeed together. */
export async function setFormSubmissionStatus(
  db: Database,
  formId: string,
  submissionId: string,
  status: FormSubmissionStatus,
  actorUserId: string,
): Promise<FormSubmission> {
  await readForm(db, formId);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(formSubmissions)
      .set({ status })
      .where(and(eq(formSubmissions.id, submissionId), eq(formSubmissions.formId, formId)))
      .returning();
    if (!row) throw new HttpError(ErrorCode.NotFound, "There is no submission with this id.");
    await tx.insert(auditLog).values({
      actorUserId,
      action: `form.submission.${status}`,
      subjectType: "form_submissions",
      subjectId: row.id,
    });
    return view(row);
  });
}

/** Permanent removal is scoped to its form and recorded with the actor. */
export async function deleteFormSubmission(
  db: Database,
  formId: string,
  submissionId: string,
  actorUserId: string,
): Promise<void> {
  await readForm(db, formId);
  await db.transaction(async (tx) => {
    const [row] = await tx
      .delete(formSubmissions)
      .where(and(eq(formSubmissions.id, submissionId), eq(formSubmissions.formId, formId)))
      .returning({ id: formSubmissions.id });
    if (!row) throw new HttpError(ErrorCode.NotFound, "There is no submission with this id.");
    await tx.insert(auditLog).values({
      actorUserId,
      action: "form.submission.deleted",
      subjectType: "form_submissions",
      subjectId: row.id,
    });
  });
}

/** Semicolon CSV opens in German spreadsheet locales; dangerous formulas stay text. */
export function submissionsCsv(fields: string[], rows: FormSubmission[]): string {
  const columns = [...new Set([...fields, ...rows.flatMap((row) => Object.keys(row.values))])];
  const cell = (value: string): string => {
    const safe = /^[\t\r\n ]*[=+\-@]/u.test(value) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const line = (values: string[]) => values.map(cell).join(";");
  const header = line(["id", "submittedAt", "status", "sourceHash", ...columns, "consents"]);
  const body = rows.map((row) =>
    line([
      row.id,
      row.createdAt,
      row.status,
      row.sourceHash ?? "",
      ...columns.map((key) => {
        const value = row.values[key];
        return Array.isArray(value) ? value.join(", ") : (value ?? "");
      }),
      row.consents.map((consent) => `${consent.revision}: ${consent.notice}`).join(" | "),
    ]),
  );
  return `\uFEFF${[header, ...body].join("\r\n")}\r\n`;
}
