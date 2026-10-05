import { z } from "zod";
import { body, MaxLength, text } from "./request.js";
import { SLUG_PATTERN } from "./slug.js";

/** Text shown in each of the site's two languages. */
export const formText = body({
  en: text(MaxLength.Paragraph),
  de: text(MaxLength.Paragraph),
});
export type FormText = z.infer<typeof formText>;

/** A hint may be absent, but both languages are still represented. */
const formHint = body({
  en: z.string().trim().max(MaxLength.Paragraph),
  de: z.string().trim().max(MaxLength.Paragraph),
});

/**
 * Deliberately small pattern language: one character class, optionally with a
 * bounded repetition. A visitor's text must never reach an author-supplied
 * regex capable of exponential backtracking.
 */
export function safeFormPattern(source: string): boolean {
  if (!/^\^\[[^\]\r\n]{1,64}\](?:\{[0-9]{1,3}(?:,[0-9]{1,3})?\})?\$$/.test(source)) return false;
  try {
    new RegExp(source, "u");
    return true;
  } catch {
    return false;
  }
}

const fieldBase = {
  key: text(MaxLength.Handle, { pattern: SLUG_PATTERN }),
  label: formText,
  hint: formHint,
  required: z.boolean(),
};

const textRules = {
  minLength: z.number().int().min(0).max(MaxLength.Paragraph),
  maxLength: z.number().int().min(1).max(MaxLength.Paragraph),
  pattern: z.string().max(80).refine(safeFormPattern).nullable(),
};

const textField = (type: "shortText" | "longText" | "email") =>
  body({ ...fieldBase, type: z.literal(type), ...textRules }).refine(
    (field) => field.minLength <= field.maxLength,
    { path: ["minLength"], message: "The minimum length exceeds the maximum." },
  );

const option = body({
  value: text(MaxLength.Handle, { pattern: SLUG_PATTERN }),
  label: formText,
});

const choices = (type: "singleChoice" | "multipleChoice") =>
  body({ ...fieldBase, type: z.literal(type), options: z.array(option).min(2).max(30) }).refine(
    (field) => new Set(field.options.map((item) => item.value)).size === field.options.length,
    { path: ["options"], message: "Choice values must be unique." },
  );

/** The declaration shared by the builder, the site's renderer and the API. */
export const formField = z.discriminatedUnion("type", [
  textField("shortText"),
  textField("longText"),
  textField("email"),
  body({
    ...fieldBase,
    type: z.literal("number"),
    min: z.number().finite().nullable(),
    max: z.number().finite().nullable(),
  }).refine((field) => field.min === null || field.max === null || field.min <= field.max, {
    path: ["min"],
    message: "The minimum exceeds the maximum.",
  }),
  choices("singleChoice"),
  choices("multipleChoice"),
  body({ ...fieldBase, type: z.literal("checkbox") }),
  body({
    ...fieldBase,
    type: z.literal("date"),
    min: z.iso.date().nullable(),
    max: z.iso.date().nullable(),
  }).refine((field) => field.min === null || field.max === null || field.min <= field.max, {
    path: ["min"],
    message: "The minimum date exceeds the maximum.",
  }),
  body({
    ...fieldBase,
    type: z.literal("consent"),
    notice: formText,
    revision: text(MaxLength.Handle),
  }),
]);
export type FormField = z.infer<typeof formField>;
export type FormFieldType = FormField["type"];

/** What the dashboard saves, including field order and form-wide settings. */
const publicDeclarationFields = {
  slug: text(MaxLength.Handle, { pattern: SLUG_PATTERN }),
  name: text(MaxLength.Line),
  successMessage: formText,
  fields: z.array(formField).min(1).max(40),
};
const uniqueFieldKeys = (form: { fields: FormField[] }) =>
  new Set(form.fields.map((field) => field.key)).size === form.fields.length;
export const createFormBody = body({
  ...publicDeclarationFields,
  notificationEmail: z.email().max(254).nullable(),
  /** Send the confirmation to this validated email field, when present. */
  confirmationEmailField: z.string().max(MaxLength.Handle).nullable().optional(),
  storeSubmissions: z.boolean(),
})
  .refine(uniqueFieldKeys, {
    path: ["fields"],
    message: "Field names must be unique.",
  })
  .refine(
    (form) =>
      !form.confirmationEmailField ||
      form.fields.some((field) => field.key === form.confirmationEmailField && field.type === "email"),
    {
      path: ["confirmationEmailField"],
      message: "Choose an email field for confirmations.",
    },
  );
export type CreateFormBody = z.infer<typeof createFormBody>;

/** Saving replaces the declaration as a whole, so order is kept in one write. */
export const saveFormBody = createFormBody;
export type SaveFormBody = CreateFormBody;

/** One form returned by the API. */
export const formDetail = createFormBody.safeExtend({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  modifiedAt: z.iso.datetime(),
});
export type FormDetail = z.infer<typeof formDetail>;

/** The declaration a public page may read, without editor-only settings. */
export const publicForm = body(publicDeclarationFields).refine(uniqueFieldKeys, {
  path: ["fields"],
  message: "Field names must be unique.",
});
export type PublicForm = z.infer<typeof publicForm>;

/** A browser may submit a value once or several times for a choice group. */
export const formSubmissionValues = z.record(
  z.string().max(MaxLength.Handle),
  z.union([z.string().max(MaxLength.Paragraph), z.array(z.string().max(MaxLength.Paragraph)).max(30)]),
);
export type FormSubmissionValues = z.infer<typeof formSubmissionValues>;

export const submitFormBody = body({
  challenge: z.string().min(1).max(256),
  honeypot: z.string().max(256),
  language: z.enum(["en", "de"]),
  values: formSubmissionValues,
});

/** The consent's exact text and revision are saved with a submission. */
export type FormConsent = { key: string; revision: string; notice: string };

/** The API and browser use the same field rules; the API remains authoritative. */
export function validateFormValues(
  form: PublicForm,
  submitted: FormSubmissionValues,
  language: "en" | "de",
): { values: FormSubmissionValues; errors: Record<string, string>; consents: FormConsent[] } {
  const values: FormSubmissionValues = {};
  const errors: Record<string, string> = {};
  const consents: FormConsent[] = [];
  const message = {
    required: language === "de" ? "Dieses Feld ist erforderlich." : "This field is required.",
    invalid: language === "de" ? "Bitte gib einen gültigen Wert ein." : "Enter a valid value.",
  };
  for (const field of form.fields) {
    const raw = submitted[field.key];
    const value =
      field.type === "multipleChoice"
        ? (Array.isArray(raw) ? raw : raw ? [raw] : []).map((item) => item.trim())
        : Array.isArray(raw)
          ? raw.map((item) => item.trim())
          : (raw ?? "").trim();
    values[field.key] = value;
    const one = typeof value === "string" ? value : "";
    const many = Array.isArray(value) ? value : [];
    const present = field.type === "multipleChoice" ? many.length > 0 : one !== "";
    if (field.required && !present) {
      errors[field.key] = message.required;
      continue;
    }
    if (!present) continue;
    switch (field.type) {
      case "shortText":
      case "longText":
      case "email":
        if (
          Array.isArray(value) ||
          one.length < field.minLength ||
          one.length > field.maxLength ||
          (field.type === "email" && !z.email().safeParse(one).success) ||
          (field.pattern !== null && !new RegExp(field.pattern, "u").test(one))
        )
          errors[field.key] = message.invalid;
        break;
      case "number": {
        const number = Number(one);
        if (
          Array.isArray(value) ||
          !Number.isFinite(number) ||
          (field.min !== null && number < field.min) ||
          (field.max !== null && number > field.max)
        )
          errors[field.key] = message.invalid;
        break;
      }
      case "singleChoice":
        if (Array.isArray(value) || !field.options.some((option) => option.value === one))
          errors[field.key] = message.invalid;
        break;
      case "multipleChoice": {
        const allowed = new Set(field.options.map((option) => option.value));
        if (
          !Array.isArray(value) ||
          many.length !== new Set(many).size ||
          many.some((item) => !allowed.has(item))
        )
          errors[field.key] = message.invalid;
        break;
      }
      case "checkbox":
        if (Array.isArray(value) || one !== "yes") errors[field.key] = message.invalid;
        break;
      case "date":
        if (
          Array.isArray(value) ||
          !z.iso.date().safeParse(one).success ||
          (field.min !== null && one < field.min) ||
          (field.max !== null && one > field.max)
        )
          errors[field.key] = message.invalid;
        break;
      case "consent":
        if (Array.isArray(value) || one !== "yes") errors[field.key] = message.invalid;
        else consents.push({ key: field.key, revision: field.revision, notice: field.notice[language] });
        break;
    }
  }
  if (Object.keys(submitted).some((key) => !form.fields.some((field) => field.key === key))) {
    errors._form = message.invalid;
  }
  return { values, errors, consents };
}

export const formList = z.array(formDetail);
export type FormList = z.infer<typeof formList>;

export const formIdParam = body({ id: z.uuid() });

export const formSubmissionStatus = z.enum(["unread", "read", "spam"]);
export type FormSubmissionStatus = z.infer<typeof formSubmissionStatus>;

/** One stored response, with only a fingerprint of the request origin. */
export const formSubmission = body({
  id: z.uuid(),
  formId: z.uuid(),
  values: formSubmissionValues,
  consents: z.array(body({ key: z.string(), revision: z.string(), notice: z.string() })),
  sourceHash: z
    .string()
    .regex(/^[0-9a-f]{12}$/)
    .nullable(),
  status: formSubmissionStatus,
  createdAt: z.iso.datetime(),
});
export type FormSubmission = z.infer<typeof formSubmission>;
export const formSubmissionList = z.array(formSubmission);
export type FormSubmissionList = z.infer<typeof formSubmissionList>;
export const updateFormSubmission = body({ status: formSubmissionStatus });
