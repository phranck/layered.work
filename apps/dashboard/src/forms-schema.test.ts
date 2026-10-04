import { createFormBody } from "@layered/schemas";
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

const form = {
  slug: "next-mini-interest",
  name: "NeXT mini interest",
  notificationEmail: "owner@example.test",
  successMessage: localized("Thank you!", "Danke!"),
  storeSubmissions: true,
  fields: allFields,
};

describe("form declarations", () => {
  it("accepts every typed field and preserves their order", () => {
    const parsed = createFormBody.parse(form);
    expect(parsed.fields.map((field) => field.key)).toEqual(allFields.map((field) => field.key));
  });

  it("refuses a field labelled in only one language", () => {
    const fields: unknown[] = allFields.map((field) => ({ ...field }));
    fields[0] = { ...allFields[0], label: localized("Name", "") };
    expect(createFormBody.safeParse({ ...form, fields }).success).toBe(false);
  });

  it("refuses duplicate field names and choice values", () => {
    expect(createFormBody.safeParse({ ...form, fields: [allFields[0], allFields[0]] }).success).toBe(false);
    const choice = allFields[4];
    expect(
      createFormBody.safeParse({
        ...form,
        fields: [{ ...choice, options: [choice.options[0], choice.options[0]] }],
      }).success,
    ).toBe(false);
  });

  it("refuses invalid ranges and unbounded or unsafe patterns", () => {
    expect(
      createFormBody.safeParse({
        ...form,
        fields: [{ ...allFields[0], minLength: 80, maxLength: 20 }],
      }).success,
    ).toBe(false);
    expect(
      createFormBody.safeParse({
        ...form,
        fields: [{ ...allFields[0], pattern: "(a+)+$" }],
      }).success,
    ).toBe(false);
  });
});
