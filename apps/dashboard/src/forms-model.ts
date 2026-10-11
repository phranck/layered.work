import {
  type CreateFormBody,
  FORM_COLUMNS,
  type FormField,
  type FormFieldType,
  type FormRow,
  fieldSpan,
  formFields,
  MaxLength,
} from "@layered/schemas";
import { bilingualText, type DashboardStringKey } from "./dashboard-i18n.js";

/** What each kind of field is called in the catalogue, which is also the label a new field starts with. */
export const FIELD_TYPE_TEXT: Record<FormFieldType, DashboardStringKey> = {
  shortText: "formTypeShortText",
  longText: "formTypeLongText",
  email: "formTypeEmail",
  number: "formTypeNumber",
  singleChoice: "formTypeSingleChoice",
  multipleChoice: "formTypeMultipleChoice",
  checkbox: "formTypeCheckbox",
  date: "formTypeDate",
  consent: "formTypeConsent",
};

/** One option of a choice field. */
type ChoiceOption = Extract<FormField, { options: unknown }>["options"][number];

/**
 * The longest answer a new text field takes, by what it asks for: a line, a
 * paragraph or an email address, each as long as the API takes such a value.
 */
const DEFAULT_MAX_LENGTH = {
  shortText: MaxLength.Line,
  longText: MaxLength.Paragraph,
  email: MaxLength.Email,
} as const satisfies Partial<Record<FormFieldType, number>>;

/**
 * The option a choice field gets next: numbered after the options it has, with
 * a value none of them holds yet, and labelled in both languages.
 *
 * @param options - The options the field has.
 */
export function newOption(options: readonly ChoiceOption[]): ChoiceOption {
  let position = options.length + 1;
  while (options.some((option) => option.value === `option-${position}`)) position += 1;
  return { value: `option-${position}`, label: bilingualText("formDefaultOption", position) };
}

/** Defaults are complete declarations, so a new field can be saved immediately. */
export function newField(type: FormFieldType, key: string): FormField {
  const common = {
    key,
    label: bilingualText(FIELD_TYPE_TEXT[type]),
    hint: { en: "", de: "" },
    required: type === "consent",
  };
  switch (type) {
    case "shortText":
    case "longText":
    case "email":
      return { ...common, type, minLength: 0, maxLength: DEFAULT_MAX_LENGTH[type], pattern: null };
    case "number":
      return { ...common, type, min: null, max: null };
    case "singleChoice":
    case "multipleChoice": {
      const first = newOption([]);
      return { ...common, type, options: [first, newOption([first])] };
    }
    case "checkbox":
      return { ...common, type };
    case "date":
      return { ...common, type, min: null, max: null };
    case "consent":
      return {
        ...common,
        type,
        notice: bilingualText("formDefaultConsent"),
        revision: "1",
      };
  }
}

/**
 * A form as the builder starts it: one short text field, a thank-you in both
 * languages, and submissions kept.
 *
 * @param name - The form's name, which only the dashboard shows.
 */
export function newForm(name: string): CreateFormBody {
  return {
    slug: "new-form",
    name,
    notificationEmail: null,
    confirmationEmailField: null,
    successMessage: bilingualText("formDefaultSuccess"),
    storeSubmissions: true,
    rows: [{ fields: [newField("shortText", "name")] }],
  };
}

/** Where a field stands: its row, and its place among that row's fields. */
export type FieldPlace = { row: number; column: number };

/**
 * Where a field goes: into an existing row, at a place among its fields, or
 * into a new row of its own, at a position among the rows.
 */
export type FieldTarget = { kind: "row"; row: number; column: number } | { kind: "new-row"; row: number };

/** A direction a key moves a field in. */
export type FieldDirection = "left" | "right" | "up" | "down";

/** A form after a change to one field, and where that field now stands. */
export type PlacedChange = { form: CreateFormBody; place: FieldPlace };

/** A number held between two bounds. */
const clamp = (value: number, lowest: number, highest: number) => Math.min(Math.max(value, lowest), highest);

/**
 * How many of a row's columns no field takes.
 *
 * @param row - The row.
 * @param except - A place in the row whose field is left out, as for a field about to move or be widened.
 */
export function freeColumns(row: FormRow, except?: number): number {
  const taken = row.fields.reduce(
    (total, field, column) => (column === except ? total : total + fieldSpan(field)),
    0,
  );
  return Math.max(0, FORM_COLUMNS - taken);
}

/** The field at a place, if there is one. */
export function fieldAt(form: CreateFormBody, place: FieldPlace): FormField | undefined {
  return form.rows[place.row]?.fields[place.column];
}

/**
 * The widest a field may be: the columns the other fields of its row leave.
 *
 * @param form - The form.
 * @param place - Where the field stands.
 */
export function widestSpan(form: CreateFormBody, place: FieldPlace): number {
  const row = form.rows[place.row];
  return row ? freeColumns(row, place.column) : FORM_COLUMNS;
}

/** The field across a number of columns, stored without a span where that is the whole row. */
function withSpan(field: FormField, span: number): FormField {
  return { ...field, span: span >= FORM_COLUMNS ? undefined : span };
}

/** The form with its rows replaced, and every row left without a field taken out. */
function withRows(form: CreateFormBody, rows: FormRow[]): CreateFormBody {
  return { ...form, rows: rows.filter((row) => row.fields.length > 0) };
}

/** The key a new field gets: numbered after the fields the form has, and held by none of them. */
function nextFieldKey(form: CreateFormBody): string {
  const fields = formFields(form);
  let number = fields.length + 1;
  while (fields.some((field) => field.key === `field-${number}`)) number += 1;
  return `field-${number}`;
}

/**
 * The form with a new field of one type where it was dropped. In an existing
 * row it takes the columns the row has left, as in lmaa; in a new row it takes
 * the whole row.
 *
 * @param form - The form as drafted.
 * @param type - The kind of field to add.
 * @param target - Where it goes. An existing row without a free column is no target.
 */
export function insertField(form: CreateFormBody, type: FormFieldType, target: FieldTarget): PlacedChange {
  const field = newField(type, nextFieldKey(form));
  if (target.kind === "row") {
    const row = form.rows[target.row];
    const free = row ? freeColumns(row) : 0;
    if (!row || free < 1) return insertField(form, type, { kind: "new-row", row: form.rows.length });
    const column = clamp(target.column, 0, row.fields.length);
    const fields = [...row.fields];
    fields.splice(column, 0, withSpan(field, free));
    return {
      form: withRows(
        form,
        form.rows.map((current, index) => (index === target.row ? { fields } : current)),
      ),
      place: { row: target.row, column },
    };
  }
  const row = clamp(target.row, 0, form.rows.length);
  return {
    form: withRows(form, [...form.rows.slice(0, row), { fields: [field] }, ...form.rows.slice(row)]),
    place: { row, column: 0 },
  };
}

/**
 * The form with the field at a place replaced, in the row and the place it
 * stands in.
 *
 * @param form - The form as drafted.
 * @param place - Where the field stands.
 * @param field - What replaces it.
 */
export function replaceField(form: CreateFormBody, place: FieldPlace, field: FormField): CreateFormBody {
  return withRows(
    form,
    form.rows.map((row, index) =>
      index === place.row
        ? { fields: row.fields.map((current, column) => (column === place.column ? field : current)) }
        : row,
    ),
  );
}

/**
 * The form without the field at a place. A row left without a field goes as well.
 *
 * @param form - The form as drafted.
 * @param place - Where the field stands.
 */
export function removeField(form: CreateFormBody, place: FieldPlace): CreateFormBody {
  return withRows(
    form,
    form.rows.map((row, index) =>
      index === place.row ? { fields: row.fields.filter((_, column) => column !== place.column) } : row,
    ),
  );
}

/**
 * The form with one field moved, within its row or to another.
 *
 * Into another row it takes as many columns as it had and that row has left,
 * and a row with no free column takes nothing. Into a new row it keeps its
 * width. The row it leaves goes when that was its last field, and a target
 * counted with that row still in place is counted again without it.
 *
 * @param form - The form as drafted.
 * @param from - Where the field stands.
 * @param target - Where it goes. For its own row, the column counts the row without it.
 * @returns The form, and where the field stands now. Unchanged where the move is impossible.
 */
export function moveField(form: CreateFormBody, from: FieldPlace, target: FieldTarget): PlacedChange {
  const field = fieldAt(form, from);
  const origin = form.rows[from.row];
  if (!field || !origin) return { form, place: from };

  if (target.kind === "row" && target.row === from.row) {
    const fields = origin.fields.filter((_, column) => column !== from.column);
    const column = clamp(target.column, 0, fields.length);
    fields.splice(column, 0, field);
    return {
      form: withRows(
        form,
        form.rows.map((row, index) => (index === from.row ? { fields } : row)),
      ),
      place: { row: from.row, column },
    };
  }

  const originGoes = origin.fields.length === 1;
  const shift = (row: number) => (originGoes && row > from.row ? row - 1 : row);
  const rows = removeField(form, from).rows;

  if (target.kind === "row") {
    const row = shift(target.row);
    const current = rows[row];
    const free = current ? freeColumns(current) : 0;
    if (!current || free < 1) return { form, place: from };
    const column = clamp(target.column, 0, current.fields.length);
    const fields = [...current.fields];
    fields.splice(column, 0, withSpan(field, Math.min(fieldSpan(field), free)));
    return {
      form: withRows(
        form,
        rows.map((existing, index) => (index === row ? { fields } : existing)),
      ),
      place: { row, column },
    };
  }

  const row = clamp(shift(target.row), 0, rows.length);
  return {
    form: withRows(form, [...rows.slice(0, row), { fields: [field] }, ...rows.slice(row)]),
    place: { row, column: 0 },
  };
}

/**
 * Where a key moves a field: left and right within its row; up and down into
 * the row on that side where it has a free column, otherwise into a row of its
 * own on that side.
 *
 * @param form - The form.
 * @param place - Where the field stands.
 * @param direction - The key's direction.
 * @returns The target, or nothing where the field cannot go further that way.
 */
export function keyTarget(
  form: CreateFormBody,
  place: FieldPlace,
  direction: FieldDirection,
): FieldTarget | undefined {
  const row = form.rows[place.row];
  if (!row) return undefined;
  const alone = row.fields.length === 1;
  switch (direction) {
    case "left":
      return place.column > 0 ? { kind: "row", row: place.row, column: place.column - 1 } : undefined;
    case "right":
      return place.column < row.fields.length - 1
        ? { kind: "row", row: place.row, column: place.column + 1 }
        : undefined;
    case "up": {
      const above = form.rows[place.row - 1];
      if (above && freeColumns(above) >= 1)
        return { kind: "row", row: place.row - 1, column: above.fields.length };
      if (!alone) return { kind: "new-row", row: place.row };
      return place.row > 0 ? { kind: "new-row", row: place.row - 1 } : undefined;
    }
    case "down": {
      const below = form.rows[place.row + 1];
      if (below && freeColumns(below) >= 1)
        return { kind: "row", row: place.row + 1, column: below.fields.length };
      if (!alone) return { kind: "new-row", row: place.row + 1 };
      return place.row < form.rows.length - 1 ? { kind: "new-row", row: place.row + 2 } : undefined;
    }
  }
}

/**
 * The form with a field's width set, within the columns its row leaves it.
 *
 * @param form - The form as drafted.
 * @param place - Where the field stands.
 * @param span - The columns asked for.
 */
export function setFieldSpan(form: CreateFormBody, place: FieldPlace, span: number): CreateFormBody {
  const field = fieldAt(form, place);
  if (!field) return form;
  return replaceField(form, place, withSpan(field, clamp(span, 1, widestSpan(form, place))));
}

/**
 * The form with one row moved to another position among the rows.
 *
 * @param form - The form as drafted.
 * @param from - The row's position.
 * @param to - The position it takes.
 */
export function moveRow(form: CreateFormBody, from: number, to: number): CreateFormBody {
  const moved = form.rows[from];
  if (!moved || to < 0 || to >= form.rows.length || from === to) return form;
  const rows = form.rows.filter((_, index) => index !== from);
  rows.splice(to, 0, moved);
  return withRows(form, rows);
}
