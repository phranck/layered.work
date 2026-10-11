import {
  type CreateFormBody,
  type FormField,
  type FormFieldType,
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

/**
 * The form with a new field of one type in a row of its own at the end, keyed
 * after the fields it has.
 *
 * @param form - The form as drafted.
 * @param type - The kind of field to add.
 */
export function addField(form: CreateFormBody, type: FormFieldType): CreateFormBody {
  const fields = formFields(form);
  let number = fields.length + 1;
  while (fields.some((field) => field.key === `field-${number}`)) number += 1;
  return { ...form, rows: [...form.rows, { fields: [newField(type, `field-${number}`)] }] };
}

/**
 * Where the field at a position of the form's reading order stands: its row
 * and its place in that row.
 *
 * @param form - The form.
 * @param index - The field's position counted across all rows.
 */
function placeOf(form: CreateFormBody, index: number): { row: number; column: number } | undefined {
  let before = 0;
  for (const [row, { fields }] of form.rows.entries()) {
    if (index < before + fields.length) return { row, column: index - before };
    before += fields.length;
  }
  return undefined;
}

/**
 * The form with the field at a position of its reading order replaced, in the
 * row and the place it stands in.
 *
 * @param form - The form as drafted.
 * @param index - The field's position counted across all rows.
 * @param field - What replaces it.
 */
export function replaceFieldAt(form: CreateFormBody, index: number, field: FormField): CreateFormBody {
  const place = placeOf(form, index);
  if (!place) return form;
  return {
    ...form,
    rows: form.rows.map((row, rowIndex) =>
      rowIndex === place.row
        ? { fields: row.fields.map((current, column) => (column === place.column ? field : current)) }
        : row,
    ),
  };
}

/**
 * The form without the field at a position of its reading order. A row left
 * with no field goes as well.
 *
 * @param form - The form as drafted.
 * @param index - The field's position counted across all rows.
 */
export function removeFieldAt(form: CreateFormBody, index: number): CreateFormBody {
  const place = placeOf(form, index);
  if (!place) return form;
  return {
    ...form,
    rows: form.rows
      .map((row, rowIndex) =>
        rowIndex === place.row ? { fields: row.fields.filter((_, column) => column !== place.column) } : row,
      )
      .filter((row) => row.fields.length > 0),
  };
}

/**
 * The form with one field moved to another position of its reading order.
 *
 * A moved field leaves its row and stands in a row of its own, placed before
 * the row that holds the target position, so in a form of one field to a row,
 * which every form saved before rows is, moving a field moves its row.
 *
 * @param form - The form as drafted.
 * @param from - The field's position counted across all rows.
 * @param to - The position it should take.
 */
export function reorderFields(form: CreateFormBody, from: number, to: number): CreateFormBody {
  const fields = formFields(form);
  const moved = fields[from];
  if (!moved || to < 0 || to >= fields.length || from === to) return form;
  const rows = removeFieldAt(form, from).rows;
  let before = 0;
  let target = 0;
  while (target < rows.length && before + (rows[target]?.fields.length ?? 0) <= to) {
    before += rows[target]?.fields.length ?? 0;
    target += 1;
  }
  return { ...form, rows: [...rows.slice(0, target), { fields: [moved] }, ...rows.slice(target)] };
}
