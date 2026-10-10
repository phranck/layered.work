import { type CreateFormBody, type FormField, type FormFieldType, MaxLength } from "@layered/schemas";
import { bilingualText, type DashboardStringKey } from "./dashboard-i18n.js";
import { moveItem } from "./sidebar-order.js";

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
