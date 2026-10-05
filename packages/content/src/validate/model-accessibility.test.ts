import { expect, it } from "vitest";
import { validateContent } from "./validate.js";

it("requires a descriptive model alt before publication", () => {
  for (const text of ['Model("cube")', 'Model("cube", alt: "")', 'Model("cube", alt: "   ")'])
    expect(validateContent(text).publishable).toBe(false);
  expect(validateContent('Model("cube", alt: "A wooden cube")').publishable).toBe(true);
});
