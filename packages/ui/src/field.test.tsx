import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Field, FieldHint, FieldLabel, Input } from "./field.js";

afterEach(cleanup);

describe("FieldLabel", () => {
  it("is a label where it names a control, and a span otherwise", () => {
    render(
      <>
        <FieldLabel htmlFor="name">Name</FieldLabel>
        <FieldLabel>Uses</FieldLabel>
      </>,
    );
    const named = screen.getByText("Name");
    expect(named.tagName).toBe("LABEL");
    expect(named.getAttribute("for")).toBe("name");
    expect(named.className).toBe("field__label");
    expect(screen.getByText("Uses").tagName).toBe("SPAN");
  });

  it("keeps the meaning its place gives it", () => {
    render(
      <dl>
        <FieldLabel as="dt" className="extra">
          From
        </FieldLabel>
      </dl>,
    );
    const term = screen.getByText("From");
    expect(term.tagName).toBe("DT");
    expect(term.className).toBe("field__label extra");
  });
});

describe("FieldHint", () => {
  it("draws every quiet line in one style, in the element its place asks for", () => {
    render(
      <>
        <FieldHint>Saved</FieldHint>
        <FieldHint as="output" data-tone="warning">
          50%
        </FieldHint>
      </>,
    );
    expect(screen.getByText("Saved").tagName).toBe("SPAN");
    const reported = screen.getByText("50%");
    expect(reported.tagName).toBe("OUTPUT");
    expect(reported.className).toBe("field__hint");
    expect(reported.getAttribute("data-tone")).toBe("warning");
  });
});

describe("Field.Set", () => {
  it("names its controls by its legend, as a fieldset does", () => {
    render(
      <Field.Set label="Scopes" hint="Choose at least one">
        <Input type="checkbox" aria-label="Read" />
      </Field.Set>,
    );
    const group = screen.getByRole("group", { name: "Scopes" });
    expect(group.tagName).toBe("FIELDSET");
    expect(group.className).toBe("field field--set");
    expect(group.querySelector("legend.field__label")?.textContent).toBe("Scopes");
    expect(group.querySelector(".field__hint")?.textContent).toBe("Choose at least one");
  });
});
