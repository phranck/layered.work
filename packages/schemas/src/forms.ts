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
export const createFormBody = body({
  slug: text(MaxLength.Handle, { pattern: SLUG_PATTERN }),
  name: text(MaxLength.Line),
  notificationEmail: z.email().max(254).nullable(),
  successMessage: formText,
  storeSubmissions: z.boolean(),
  fields: z.array(formField).min(1).max(40),
}).refine((form) => new Set(form.fields.map((field) => field.key)).size === form.fields.length, {
  path: ["fields"],
  message: "Field names must be unique.",
});
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

export const formList = z.array(formDetail);
export type FormList = z.infer<typeof formList>;

export const formIdParam = body({ id: z.uuid() });
