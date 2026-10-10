import { type CreateFormBody, type FormField, type FormFieldType, MaxLength } from "@layered/schemas";
import { moveItem } from "./sidebar-order.js";

export const FIELD_TYPES: readonly FormFieldType[] = [
  "shortText",
  "longText",
  "email",
  "number",
  "singleChoice",
  "multipleChoice",
  "checkbox",
  "date",
  "consent",
];

export const FIELD_NAMES: Record<FormFieldType, { en: string; de: string }> = {
  shortText: { en: "Short text", de: "Kurztext" },
  longText: { en: "Long text", de: "Langtext" },
  email: { en: "Email", de: "E-Mail" },
  number: { en: "Number", de: "Zahl" },
  singleChoice: { en: "Single choice", de: "Einfachauswahl" },
  multipleChoice: { en: "Multiple choice", de: "Mehrfachauswahl" },
  checkbox: { en: "Checkbox", de: "Kontrollkästchen" },
  date: { en: "Date", de: "Datum" },
  consent: { en: "Consent notice", de: "Einwilligung" },
};

/**
 * The longest answer a new text field takes, by what it asks for: a line, a
 * paragraph or an email address, each as long as the API takes such a value.
 */
const DEFAULT_MAX_LENGTH = {
  shortText: MaxLength.Line,
  longText: MaxLength.Paragraph,
  email: MaxLength.Email,
} as const satisfies Partial<Record<FormFieldType, number>>;

/** Defaults are complete declarations, so a new field can be saved immediately. */
export function newField(type: FormFieldType, key: string): FormField {
  const common = {
    key,
    label: { en: FIELD_NAMES[type].en, de: FIELD_NAMES[type].de },
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
    case "multipleChoice":
      return {
        ...common,
        type,
        options: [
          { value: "option-1", label: { en: "Option 1", de: "Option 1" } },
          { value: "option-2", label: { en: "Option 2", de: "Option 2" } },
        ],
      };
    case "checkbox":
      return { ...common, type };
    case "date":
      return { ...common, type, min: null, max: null };
    case "consent":
      return {
        ...common,
        type,
        notice: { en: "I agree.", de: "Ich stimme zu." },
        revision: "1",
      };
  }
}

export function newForm(): CreateFormBody {
  return {
    slug: "new-form",
    name: "New form",
    notificationEmail: null,
    confirmationEmailField: null,
    successMessage: { en: "Thank you!", de: "Vielen Dank!" },
    storeSubmissions: true,
    fields: [newField("shortText", "name")],
  };
}

export function addField(form: CreateFormBody, type: FormFieldType): CreateFormBody {
  let number = form.fields.length + 1;
  while (form.fields.some((field) => field.key === `field-${number}`)) number += 1;
  return { ...form, fields: [...form.fields, newField(type, `field-${number}`)] };
}

export function reorderFields(form: CreateFormBody, from: number, to: number): CreateFormBody {
  if (from < 0 || from >= form.fields.length || to < 0 || to >= form.fields.length || from === to)
    return form;
  return { ...form, fields: moveItem(form.fields, from, to) };
}
