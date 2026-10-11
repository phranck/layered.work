import { createFormBody, FORM_COLUMNS, FORM_FIELD_COUNT, formFields, withFormRows } from "@layered/schemas";
import { describe, expect, it } from "vitest";

const localized = (en: string, de: string) => ({ en, de });

const common = (key: string) => ({
  key,
  label: localized(key, key),
  hint: localized("", ""),
  required: false,
});

const allFields = [
  { ...common("name"), type: "shortText", minLength: 1, maxLength: 120, pattern: null },
  { ...common("message"), type: "longText", minLength: 0, maxLength: 2000, pattern: null },
  { ...common("email"), type: "email", minLength: 0, maxLength: 254, pattern: null },
  { ...common("quantity"), type: "number", min: 1, max: 10 },
  {
    ...common("model"),
    type: "singleChoice",
    options: [
      { value: "small", label: localized("Small", "Klein") },
      { value: "large", label: localized("Large", "Groß") },
    ],
  },
  {
    ...common("features"),
    type: "multipleChoice",
    options: [
      { value: "light", label: localized("Light", "Licht") },
      { value: "sound", label: localized("Sound", "Ton") },
    ],
  },
  { ...common("updates"), type: "checkbox" },
  { ...common("date"), type: "date", min: null, max: null },
  {
    ...common("consent"),
    type: "consent",
    required: true,
    notice: localized("I agree to be contacted.", "Ich stimme einer Kontaktaufnahme zu."),
    revision: "2026-10",
  },
] as const;

/** Each field in a row of its own. */
const rowsOf = (fields: readonly unknown[]) => fields.map((field) => ({ fields: [field] }));

const form = {
  slug: "next-mini-interest",
  name: "NeXT mini interest",
  notificationEmail: "owner@example.test",
  successMessage: localized("Thank you!", "Danke!"),
  storeSubmissions: true,
  rows: rowsOf(allFields),
};

describe("form declarations", () => {
  it("accepts every typed field and preserves their order", () => {
    const parsed = createFormBody.parse(form);
    expect(formFields(parsed).map((field) => field.key)).toEqual(allFields.map((field) => field.key));
  });

  it("refuses a field labelled in only one language", () => {
    const fields: unknown[] = allFields.map((field) => ({ ...field }));
    fields[0] = { ...allFields[0], label: localized("Name", "") };
    expect(createFormBody.safeParse({ ...form, rows: rowsOf(fields) }).success).toBe(false);
  });

  it("refuses duplicate field names and choice values", () => {
    expect(createFormBody.safeParse({ ...form, rows: rowsOf([allFields[0], allFields[0]]) }).success).toBe(
      false,
    );
    const choice = allFields[4];
    expect(
      createFormBody.safeParse({
        ...form,
        rows: rowsOf([{ ...choice, options: [choice.options[0], choice.options[0]] }]),
      }).success,
    ).toBe(false);
  });

  it("refuses invalid ranges and unbounded or unsafe patterns", () => {
    expect(
      createFormBody.safeParse({
        ...form,
        rows: rowsOf([{ ...allFields[0], minLength: 80, maxLength: 20 }]),
      }).success,
    ).toBe(false);
    expect(
      createFormBody.safeParse({
        ...form,
        rows: rowsOf([{ ...allFields[0], pattern: "(a+)+$" }]),
      }).success,
    ).toBe(false);
  });

  it("accepts confirmations only when they target a declared email field", () => {
    expect(createFormBody.safeParse({ ...form, confirmationEmailField: "email" }).success).toBe(true);
    expect(createFormBody.safeParse({ ...form, confirmationEmailField: "name" }).success).toBe(false);
    expect(createFormBody.safeParse({ ...form, confirmationEmailField: "absent" }).success).toBe(false);
  });
});

describe("rows of fields", () => {
  const [name, , email] = allFields;

  it("lets fields share a row as long as their spans fit its twelve columns", () => {
    const half = {
      ...form,
      rows: [
        {
          fields: [
            { ...name, span: 6 },
            { ...email, span: 6 },
          ],
        },
      ],
    };
    expect(createFormBody.safeParse(half).success).toBe(true);
    const over = {
      ...form,
      rows: [
        {
          fields: [
            { ...name, span: 7 },
            { ...email, span: 6 },
          ],
        },
      ],
    };
    expect(createFormBody.safeParse(over).success).toBe(false);
    // A field without a span takes the whole row, so nothing fits beside it.
    const full = { ...form, rows: [{ fields: [name, { ...email, span: 1 }] }] };
    expect(createFormBody.safeParse(full).success).toBe(false);
  });

  it("refuses a span outside the row's columns and a row without fields", () => {
    for (const span of [0, FORM_COLUMNS + 1, 1.5]) {
      expect(createFormBody.safeParse({ ...form, rows: [{ fields: [{ ...name, span }] }] }).success).toBe(
        false,
      );
    }
    expect(createFormBody.safeParse({ ...form, rows: [{ fields: [] }] }).success).toBe(false);
  });

  it("counts the fields of every row against the most a form holds", () => {
    const many = Array.from({ length: FORM_FIELD_COUNT.max + 1 }, (_, index) => ({
      ...name,
      key: `field-${index}`,
      span: 3,
    }));
    const rows = Array.from({ length: Math.ceil(many.length / 4) }, (_, index) => ({
      fields: many.slice(index * 4, index * 4 + 4),
    }));
    expect(createFormBody.safeParse({ ...form, rows }).success).toBe(false);
  });

  it("reads a declaration saved before rows with one field in each", () => {
    const { rows: _rows, ...withoutRows } = form;
    const legacy = withFormRows({ ...withoutRows, fields: [name, email] });
    expect(legacy).not.toHaveProperty("fields");
    expect(createFormBody.parse(legacy).rows.map((row) => row.fields.map((field) => field.key))).toEqual([
      ["name"],
      ["email"],
    ]);
  });
});
