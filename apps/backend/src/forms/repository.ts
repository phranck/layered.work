import { type CreateFormBody, ErrorCode, type FormDetail } from "@layered/schemas";
import { asc, eq } from "drizzle-orm";
import type { Database } from "../db/connect.js";
import { auditLog, forms } from "../db/schema/index.js";
import { HttpError } from "../http/response.js";

type FormRow = typeof forms.$inferSelect;

function detail(row: FormRow): FormDetail {
  return {
    ...row.declaration,
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    modifiedAt: row.modifiedAt.toISOString(),
  };
}

/** Every form, in the order the builder shows them. */
export async function listForms(db: Database): Promise<FormDetail[]> {
  return (await db.select().from(forms).orderBy(asc(forms.name))).map(detail);
}

/** A form for its dashboard identifier. */
export async function readForm(db: Database, id: string): Promise<FormDetail> {
  const [row] = await db.select().from(forms).where(eq(forms.id, id)).limit(1);
  if (!row) throw new HttpError(ErrorCode.NotFound, "There is no form with this id.");
  return detail(row);
}

/** The public site resolves the shortcode's stable name through this read. */
export async function readFormBySlug(db: Database, slug: string): Promise<FormDetail> {
  const [row] = await db.select().from(forms).where(eq(forms.slug, slug)).limit(1);
  if (!row) throw new HttpError(ErrorCode.NotFound, "There is no form with this name.");
  return detail(row);
}

/** Saves a validated declaration and records who created it. */
export async function createForm(
  db: Database,
  value: CreateFormBody,
  actorUserId: string,
): Promise<FormDetail> {
  const [existing] = await db.select({ id: forms.id }).from(forms).where(eq(forms.slug, value.slug)).limit(1);
  if (existing) throw new HttpError(ErrorCode.Conflict, "A form already uses this name.");

  const [row] = await db.transaction(async (tx) => {
    const created = await tx
      .insert(forms)
      .values({ slug: value.slug, name: value.name, declaration: value })
      .onConflictDoNothing({ target: forms.slug })
      .returning();
    if (!created[0]) throw new HttpError(ErrorCode.Conflict, "A form already uses this name.");
    await tx.insert(auditLog).values({
      actorUserId,
      action: "form.created",
      subjectType: "forms",
      subjectId: created[0].id,
    });
    return created;
  });
  if (!row) throw new Error("The form was not written.");
  return detail(row);
}

/** Replaces one declaration atomically, including its field order. */
export async function saveForm(
  db: Database,
  id: string,
  value: CreateFormBody,
  actorUserId: string,
): Promise<FormDetail> {
  const [row] = await db.transaction(async (tx) => {
    const [current] = await tx.select({ id: forms.id }).from(forms).where(eq(forms.id, id)).limit(1);
    if (!current) throw new HttpError(ErrorCode.NotFound, "There is no form with this id.");
    const [taken] = await tx.select({ id: forms.id }).from(forms).where(eq(forms.slug, value.slug)).limit(1);
    if (taken && taken.id !== id) throw new HttpError(ErrorCode.Conflict, "A form already uses this name.");
    const updated = await tx
      .update(forms)
      .set({ slug: value.slug, name: value.name, declaration: value, modifiedAt: new Date() })
      .where(eq(forms.id, id))
      .returning();
    await tx.insert(auditLog).values({
      actorUserId,
      action: "form.updated",
      subjectType: "forms",
      subjectId: id,
    });
    return updated;
  });
  if (!row) throw new Error("The form was not updated.");
  return detail(row);
}
