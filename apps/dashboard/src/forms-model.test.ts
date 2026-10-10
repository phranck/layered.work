import { createFormBody, FORM_FIELD_TYPES } from "@layered/schemas";
import { describe, expect, it } from "vitest";
import { addField, newField, newForm, newOption, reorderFields } from "./forms-model.js";

describe("form builder model", () => {
  it("creates a savable declaration for every field type", () => {
    const fields = FORM_FIELD_TYPES.map((type, index) => newField(type, `field-${index}`));
    expect(createFormBody.safeParse({ ...newForm("New form"), fields }).success).toBe(true);
  });

  it("labels a new field with the name of its kind in both languages", () => {
    expect(newField("email", "contact").label).toEqual({ en: "Email", de: "E-Mail" });
  });

  it("numbers a new option past the values its field already holds", () => {
    const options = [newOption([]), { value: "option-3", label: { en: "Third", de: "Dritte" } }];
    expect(newOption(options)).toEqual({ value: "option-4", label: { en: "Option 4", de: "Option 4" } });
  });

  it("adds unique keys and saves drag order in the declaration", () => {
    const withFields = addField(addField(newForm("New form"), "email"), "consent");
    const reordered = reorderFields(withFields, 2, 0);
    expect(reordered.fields.map((field) => field.key)).toEqual(["field-3", "name", "field-2"]);
    expect(createFormBody.parse(reordered).fields.map((field) => field.key)).toEqual([
      "field-3",
      "name",
      "field-2",
    ]);
  });
});
