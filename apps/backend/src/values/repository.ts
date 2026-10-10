import { referencedValueNames, resolveValues } from "@layered/content";
import {
  type CreateNamedValueBody,
  ErrorCode,
  LISTED_KINDS,
  type ListedKind,
  type ListingSettings,
  type NamedValue,
  type NamedValueUse,
  namedValueList,
  type UpdateNamedValueBody,
} from "@layered/schemas";
import { asc, eq } from "drizzle-orm";
import type { Database } from "../db/connect.js";
import { auditLog, entryTranslations, namedValues } from "../db/schema/index.js";
import { isUniqueViolation } from "../db/unique-violation.js";
import { HttpError } from "../http/response.js";
import { readListingSettings } from "../settings/repository.js";

/**
 * Named values: lines of text kept once and referred to from bodies as
 * `{{ name }}`.
 *
 * The backend replaces every reference before a body leaves it, in the
 * snapshot and the preview, so the site never learns that values exist. What
 * this module adds besides storing them is the refusal that keeps a page from
 * ever referring to nothing: a value a body still refers to cannot be deleted,
 * and its name, being what bodies write, cannot change.
 */

type Reader = Pick<Database, "select">;

/** The constraint the migration created on the name, which a second value of one name runs into. */
const NAME_CONSTRAINT = "named_values_name_unique";

/**
 * Every value's text, by its name, which is what `resolveValues` takes.
 *
 * @param db - The database or a transaction.
 */
export async function readValueMap(db: Reader): Promise<Map<string, string>> {
  const rows = await db.select({ name: namedValues.name, value: namedValues.value }).from(namedValues);
  return new Map(rows.map((row) => [row.name, row.value]));
}

/**
 * The overviews' settings with every reference in their introductions replaced,
 * as the site shows them.
 *
 * @param listings - The settings as stored.
 * @param values - Every value, by its name.
 */
export function resolveListingIntroductions(
  listings: Record<ListedKind, ListingSettings>,
  values: ReadonlyMap<string, string>,
): Record<ListedKind, ListingSettings> {
  const resolve = ({ introduction, ...rest }: ListingSettings): ListingSettings => ({
    ...rest,
    introduction: { en: resolveValues(introduction.en, values), de: resolveValues(introduction.de, values) },
  });
  return { post: resolve(listings.post), project: resolve(listings.project) };
}

/**
 * Where each value is referred to: every entry with a translation whose body
 * names it, drafts and the trash included because either may be published
 * again, and every overview whose introduction names it.
 *
 * Read from the bodies on every call rather than kept in a table, so it cannot
 * fall behind an edit. A body without `{{` is not parsed at all.
 *
 * @param db - The database or a transaction.
 * @returns The places that refer to each name, by name.
 */
async function usesByName(db: Reader): Promise<Map<string, NamedValueUse[]>> {
  const uses = new Map<string, NamedValueUse[]>();
  const add = (name: string, use: NamedValueUse) => uses.set(name, [...(uses.get(name) ?? []), use]);

  const translations = await db
    .select({
      entryId: entryTranslations.entryId,
      title: entryTranslations.title,
      body: entryTranslations.body,
    })
    .from(entryTranslations)
    .orderBy(asc(entryTranslations.title));
  const counted = new Set<string>();
  for (const translation of translations) {
    for (const name of referencedValueNames(translation.body)) {
      // An entry is named once per value, whichever of its translations refers to it.
      const key = `${name}\u0000${translation.entryId}`;
      if (counted.has(key)) continue;
      counted.add(key);
      add(name, { kind: "entry", entryId: translation.entryId, title: translation.title });
    }
  }

  const listings = await readListingSettings(db);
  for (const listing of LISTED_KINDS) {
    const { en, de } = listings[listing].introduction;
    for (const name of new Set([...referencedValueNames(en), ...referencedValueNames(de)])) {
      add(name, { kind: "listing", listing });
    }
  }
  return uses;
}

/**
 * Every value, in the order of its name, with where it is referred to.
 *
 * @param db - The database.
 */
export async function listNamedValues(db: Database): Promise<NamedValue[]> {
  const rows = await db
    .select({ id: namedValues.id, name: namedValues.name, value: namedValues.value })
    .from(namedValues)
    .orderBy(asc(namedValues.name));
  const uses = await usesByName(db);
  return namedValueList.parse(rows.map((row) => ({ ...row, usedBy: uses.get(row.name) ?? [] })));
}

/**
 * One value as the list shows it.
 *
 * @param db - The database.
 * @param id - The value.
 * @throws `not_found` when there is no such value.
 */
async function readNamedValue(db: Database, id: string): Promise<NamedValue> {
  const found = (await listNamedValues(db)).find((value) => value.id === id);
  if (!found) throw new HttpError(ErrorCode.NotFound, "There is no value with this id.");
  return found;
}

/**
 * Stores a new value.
 *
 * @param db - The database.
 * @param value - Its name and text, already validated.
 * @param actorUserId - Who added it, for the audit log.
 * @throws `conflict` when a value of this name exists already.
 */
export async function createNamedValue(
  db: Database,
  value: CreateNamedValueBody,
  actorUserId: string,
): Promise<NamedValue> {
  let id: string;
  try {
    id = await db.transaction(async (tx) => {
      const [row] = await tx.insert(namedValues).values(value).returning({ id: namedValues.id });
      if (!row) throw new Error("The value was not written.");
      await tx.insert(auditLog).values({
        actorUserId,
        action: "named_value.created",
        subjectType: "named_values",
        subjectId: row.id,
        detail: { name: value.name },
      });
      return row.id;
    });
  } catch (error) {
    if (isUniqueViolation(error, NAME_CONSTRAINT)) {
      throw new HttpError(ErrorCode.Conflict, "A value with this name exists already.");
    }
    throw error;
  }
  return readNamedValue(db, id);
}

/**
 * Changes a value's text. Its name stays, because bodies refer to it by name.
 *
 * @param db - The database.
 * @param id - The value.
 * @param value - The new text, already validated.
 * @param actorUserId - Who changed it, for the audit log.
 * @throws `not_found` when there is no such value.
 */
export async function updateNamedValue(
  db: Database,
  id: string,
  value: UpdateNamedValueBody,
  actorUserId: string,
): Promise<NamedValue> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(namedValues)
      .set({ value: value.value })
      .where(eq(namedValues.id, id))
      .returning({ name: namedValues.name });
    if (!row) throw new HttpError(ErrorCode.NotFound, "There is no value with this id.");
    await tx.insert(auditLog).values({
      actorUserId,
      action: "named_value.updated",
      subjectType: "named_values",
      subjectId: id,
      detail: { name: row.name },
    });
  });
  return readNamedValue(db, id);
}

/**
 * Deletes a value nothing refers to.
 *
 * The row is locked before the bodies are read, so a value cannot be removed
 * between the check and the delete by a second request doing the same.
 *
 * @param db - The database.
 * @param id - The value.
 * @param actorUserId - Who deleted it, for the audit log.
 * @throws `not_found` when there is no such value, and `conflict` while an
 *   entry or an overview's introduction still refers to it.
 */
export async function deleteNamedValue(db: Database, id: string, actorUserId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ name: namedValues.name })
      .from(namedValues)
      .where(eq(namedValues.id, id))
      .for("update");
    if (!row) throw new HttpError(ErrorCode.NotFound, "There is no value with this id.");

    const uses = (await usesByName(tx)).get(row.name) ?? [];
    if (uses.length > 0) {
      throw new HttpError(
        ErrorCode.Conflict,
        `This value is still used in ${uses.length === 1 ? "one place" : `${uses.length} places`}.`,
      );
    }

    await tx.delete(namedValues).where(eq(namedValues.id, id));
    await tx.insert(auditLog).values({
      actorUserId,
      action: "named_value.deleted",
      subjectType: "named_values",
      subjectId: id,
      detail: { name: row.name },
    });
  });
}
