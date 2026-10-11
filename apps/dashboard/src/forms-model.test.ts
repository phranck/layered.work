import {
  type CreateFormBody,
  createFormBody,
  FORM_FIELD_TYPES,
  fieldSpan,
  formFields,
} from "@layered/schemas";
import { describe, expect, it } from "vitest";
import {
  fieldAt,
  insertField,
  keyTarget,
  moveField,
  moveRow,
  newField,
  newForm,
  newOption,
  removeField,
  replaceField,
  setFieldSpan,
  widestSpan,
} from "./forms-model.js";

/** The keys of a form, row by row. */
const keys = (form: CreateFormBody) => form.rows.map((row) => row.fields.map((field) => field.key));

/** The widths of a form's fields, row by row. */
const spans = (form: CreateFormBody) => form.rows.map((row) => row.fields.map((field) => fieldSpan(field)));

/**
 * A form of three rows: `name` and `email` sharing the first at half width
 * each, `message` alone across the second, and `phone` on a third third.
 */
function sample(): CreateFormBody {
  return {
    ...newForm("Sample"),
    rows: [
      {
        fields: [
          { ...newField("shortText", "name"), span: 6 },
          { ...newField("email", "email"), span: 6 },
        ],
      },
      { fields: [newField("longText", "message")] },
      { fields: [{ ...newField("shortText", "phone"), span: 4 }] },
    ],
  };
}

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

  describe("inserting", () => {
    it("adds a field in a row of its own across the whole row, with a key no field holds", () => {
      const { form, place } = insertField(newForm("New form"), "email", { kind: "new-row", row: 1 });
      expect(keys(form)).toEqual([["name"], ["field-2"]]);
      expect(place).toEqual({ row: 1, column: 0 });
      expect(fieldAt(form, place)?.span).toBeUndefined();
    });

    it("gives a field dropped into a row the columns that row has left", () => {
      const { form, place } = insertField(sample(), "date", { kind: "row", row: 2, column: 0 });
      expect(keys(form)[2]).toEqual(["field-5", "phone"]);
      expect(spans(form)[2]).toEqual([8, 4]);
      expect(place).toEqual({ row: 2, column: 0 });
      expect(createFormBody.safeParse(form).success).toBe(true);
    });

    it("puts a field dropped onto a full row into a new row at the end instead", () => {
      const { form, place } = insertField(sample(), "date", { kind: "row", row: 0, column: 1 });
      expect(keys(form)).toEqual([["name", "email"], ["message"], ["phone"], ["field-5"]]);
      expect(place).toEqual({ row: 3, column: 0 });
    });
  });

  describe("moving", () => {
    it("reorders a field within its own row", () => {
      const { form, place } = moveField(sample(), { row: 0, column: 0 }, { kind: "row", row: 0, column: 1 });
      expect(keys(form)[0]).toEqual(["email", "name"]);
      expect(place).toEqual({ row: 0, column: 1 });
    });

    it("narrows a field moved into another row to the columns that row has left", () => {
      const { form, place } = moveField(sample(), { row: 0, column: 1 }, { kind: "row", row: 2, column: 1 });
      expect(keys(form)).toEqual([["name"], ["message"], ["phone", "email"]]);
      expect(spans(form)).toEqual([[6], [12], [4, 6]]);
      expect(place).toEqual({ row: 2, column: 1 });
    });

    it("refuses a move into a row without a free column", () => {
      const before = sample();
      const { form, place } = moveField(before, { row: 2, column: 0 }, { kind: "row", row: 1, column: 0 });
      expect(form).toBe(before);
      expect(place).toEqual({ row: 2, column: 0 });
    });

    it("counts the target again once the row a field left is gone, and keeps its width in a new row", () => {
      const { form, place } = moveField(sample(), { row: 1, column: 0 }, { kind: "row", row: 2, column: 0 });
      expect(keys(form)).toEqual([
        ["name", "email"],
        ["message", "phone"],
      ]);
      expect(spans(form)[1]).toEqual([8, 4]);
      expect(place).toEqual({ row: 1, column: 0 });

      const alone = moveField(sample(), { row: 0, column: 1 }, { kind: "new-row", row: 3 });
      expect(keys(alone.form)).toEqual([["name"], ["message"], ["phone"], ["email"]]);
      expect(spans(alone.form)[3]).toEqual([6]);
    });
  });

  describe("keys", () => {
    it("moves up into the row above where it has a free column, and otherwise into a row of its own", () => {
      const form = sample();
      expect(keyTarget(form, { row: 2, column: 0 }, "up")).toEqual({ kind: "new-row", row: 1 });
      expect(keyTarget(form, { row: 0, column: 1 }, "up")).toEqual({ kind: "new-row", row: 0 });
      expect(keyTarget(form, { row: 1, column: 0 }, "down")).toEqual({ kind: "row", row: 2, column: 1 });
    });

    it("goes no further than the edges of its row and of the form", () => {
      const form = sample();
      expect(keyTarget(form, { row: 0, column: 0 }, "left")).toBeUndefined();
      expect(keyTarget(form, { row: 0, column: 1 }, "right")).toBeUndefined();
      expect(keyTarget(form, { row: 2, column: 0 }, "down")).toBeUndefined();
      expect(keyTarget({ ...form, rows: form.rows.slice(1) }, { row: 0, column: 0 }, "up")).toBeUndefined();
    });
  });

  describe("width", () => {
    it("holds a field's width within what the other fields of its row leave", () => {
      const form = sample();
      expect(widestSpan(form, { row: 0, column: 0 })).toBe(6);
      expect(spans(setFieldSpan(form, { row: 0, column: 0 }, 10))[0]).toEqual([6, 6]);
      expect(spans(setFieldSpan(form, { row: 0, column: 0 }, 0))[0]).toEqual([1, 6]);
    });

    it("stores no width for a field across the whole row", () => {
      const widened = setFieldSpan(sample(), { row: 2, column: 0 }, 12);
      expect(fieldAt(widened, { row: 2, column: 0 })?.span).toBeUndefined();
    });
  });

  it("keeps a row of several fields when one is changed, and drops a row left without a field", () => {
    const form = sample();
    const renamed = replaceField(form, { row: 0, column: 1 }, { ...newField("email", "reply"), span: 6 });
    expect(keys(renamed)[0]).toEqual(["name", "reply"]);
    expect(keys(removeField(form, { row: 1, column: 0 }))).toEqual([["name", "email"], ["phone"]]);
  });

  it("moves a row to another position among the rows", () => {
    expect(keys(moveRow(sample(), 2, 0))).toEqual([["phone"], ["name", "email"], ["message"]]);
    expect(formFields(moveRow(sample(), 0, 5))).toEqual(formFields(sample()));
  });
});
