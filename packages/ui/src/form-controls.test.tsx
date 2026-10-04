import type { FormField } from "@layered/schemas";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FormControls } from "./form-controls.js";

const common = (key: string) => ({
  key,
  label: { en: key, de: `${key} DE` },
  hint: { en: "", de: "" },
  required: true,
});
const fields: FormField[] = [
  { ...common("name"), type: "shortText", minLength: 2, maxLength: 80, pattern: null },
  { ...common("message"), type: "longText", minLength: 0, maxLength: 2000, pattern: null },
  { ...common("email"), type: "email", minLength: 1, maxLength: 254, pattern: null },
  { ...common("count"), type: "number", min: 1, max: 10 },
  {
    ...common("choice"),
    type: "singleChoice",
    options: [
      { value: "a", label: { en: "A", de: "A DE" } },
      { value: "b", label: { en: "B", de: "B DE" } },
    ],
  },
  {
    ...common("many"),
    type: "multipleChoice",
    options: [
      { value: "a", label: { en: "A", de: "A DE" } },
      { value: "b", label: { en: "B", de: "B DE" } },
    ],
  },
  { ...common("check"), type: "checkbox" },
  { ...common("day"), type: "date", min: null, max: null },
  { ...common("consent"), type: "consent", notice: { en: "I agree", de: "Ich stimme zu" }, revision: "1" },
];

afterEach(cleanup);

describe("FormControls", () => {
  it("renders every declared type with native controls and the requested language", () => {
    const { container } = render(<FormControls fields={fields} language="de" />);
    expect(container.querySelectorAll("input, textarea, select")).toHaveLength(10);
    expect(container.querySelector('input[name="email"]')?.getAttribute("type")).toBe("email");
    expect(container.querySelector('input[name="day"]')?.getAttribute("type")).toBe("date");
    expect(container.querySelector('input[name="name"]')?.getAttribute("minlength")).toBe("2");
    expect(container.textContent).toContain("Ich stimme zu");
    expect(container.textContent).toContain("name DE");
  });

  it("retains submitted values and marks a failed field", () => {
    const { container } = render(
      <FormControls
        fields={fields}
        language="en"
        values={{ name: "Frank", many: ["b"] }}
        errors={{ name: "Too short" }}
      />,
    );
    expect((container.querySelector('input[name="name"]') as HTMLInputElement).value).toBe("Frank");
    expect((container.querySelector('input[name="many"][value="b"]') as HTMLInputElement).checked).toBe(true);
    expect(container.querySelector('input[name="name"]')?.getAttribute("aria-invalid")).toBe("true");
    expect(container.textContent).toContain("Too short");
  });
});
