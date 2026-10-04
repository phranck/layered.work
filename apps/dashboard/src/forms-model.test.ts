import { createFormBody } from "@layered/schemas";
import { describe, expect, it } from "vitest";
import { addField, FIELD_TYPES, newField, newForm, reorderFields } from "./forms-model.js";

describe("form builder model", () => {
  it("creates a savable declaration for every field type", () => {
    const fields = FIELD_TYPES.map((type, index) => newField(type, `field-${index}`));
    expect(createFormBody.safeParse({ ...newForm(), fields }).success).toBe(true);
  });

  it("adds unique keys and saves drag order in the declaration", () => {
    const withFields = addField(addField(newForm(), "email"), "consent");
    const reordered = reorderFields(withFields, 2, 0);
    expect(reordered.fields.map((field) => field.key)).toEqual(["field-3", "name", "field-2"]);
    expect(createFormBody.parse(reordered).fields.map((field) => field.key)).toEqual([
      "field-3",
      "name",
      "field-2",
    ]);
  });
});
