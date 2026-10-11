import { createFormBody, FORM_FIELD_TYPES, formFields } from "@layered/schemas";
import { describe, expect, it } from "vitest";
import {
  addField,
  newField,
  newForm,
  newOption,
  removeFieldAt,
  reorderFields,
  replaceFieldAt,
} from "./forms-model.js";

/** The keys of a form, row by row. */
const keys = (form: ReturnType<typeof newForm>) =>
  form.rows.map((row) => row.fields.map((field) => field.key));

describe("form builder model", () => {
  it("creates a savable declaration for every field type", () => {
    const rows = FORM_FIELD_TYPES.map((type, index) => ({ fields: [newField(type, `field-${index}`)] }));
    expect(createFormBody.safeParse({ ...newForm("New form"), rows }).success).toBe(true);
  });

  it("labels a new field with the name of its kind in both languages", () => {
    expect(newField("email", "contact").label).toEqual({ en: "Email", de: "E-Mail" });
  });

  it("numbers a new option past the values its field already holds", () => {
    const options = [newOption([]), { value: "option-3", label: { en: "Third", de: "Dritte" } }];
    expect(newOption(options)).toEqual({ value: "option-4", label: { en: "Option 4", de: "Option 4" } });
  });

  it("adds each field in a row of its own with a unique key, and saves the drag order", () => {
    const withFields = addField(addField(newForm("New form"), "email"), "consent");
    expect(keys(withFields)).toEqual([["name"], ["field-2"], ["field-3"]]);
    const reordered = reorderFields(withFields, 2, 0);
    expect(keys(reordered)).toEqual([["field-3"], ["name"], ["field-2"]]);
    expect(keys(createFormBody.parse(reordered))).toEqual([["field-3"], ["name"], ["field-2"]]);
  });

  it("keeps a row of several fields when one of them is changed, and drops a row left empty", () => {
    const base = newForm("New form");
    const [name] = formFields(base);
    if (!name) throw new Error("Missing field");
    const shared = {
      ...base,
      rows: [
        {
          fields: [
            { ...name, span: 6 },
            { ...newField("email", "email"), span: 6 },
          ],
        },
      ],
    };
    const renamed = replaceFieldAt(shared, 1, { ...newField("email", "reply"), span: 6 });
    expect(keys(renamed)).toEqual([["name", "reply"]]);
    expect(keys(removeFieldAt(renamed, 0))).toEqual([["reply"]]);
    expect(removeFieldAt(removeFieldAt(renamed, 0), 0).rows).toEqual([]);
  });

  it("takes a moved field out of its row into a row of its own", () => {
    const base = newForm("New form");
    const [name] = formFields(base);
    if (!name) throw new Error("Missing field");
    const shared = {
      ...base,
      rows: [
        {
          fields: [
            { ...name, span: 6 },
            { ...newField("email", "email"), span: 6 },
          ],
        },
        { fields: [newField("longText", "message")] },
      ],
    };
    expect(keys(reorderFields(shared, 2, 0))).toEqual([["message"], ["name", "email"]]);
    expect(keys(reorderFields(shared, 1, 2))).toEqual([["name"], ["message"], ["email"]]);
  });
});
