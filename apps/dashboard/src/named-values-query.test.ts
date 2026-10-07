import type { NamedValue } from "@layered/schemas";
import { describe, expect, it } from "vitest";
import { checkedValueDraft } from "./named-values-query.js";

const EXISTING: NamedValue = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "product",
  value: "Velvet",
  usedBy: [],
};

describe("a value's draft before it is saved", () => {
  it("is refused whole for a new value whose name is in the wrong shape", () => {
    expect(checkedValueDraft(null, { name: "Product Name", value: "Velvet" })).toBeNull();
    expect(checkedValueDraft(null, { name: "product-name", value: "Velvet" })).toEqual({
      name: "product-name",
      value: "Velvet",
    });
  });

  it("keeps an existing value's name and checks only its text", () => {
    expect(checkedValueDraft(EXISTING, { name: "Renamed Somehow", value: "  Velvet 2  " })).toEqual({
      name: "product",
      value: "Velvet 2",
    });
    expect(checkedValueDraft(EXISTING, { name: "product", value: "two\nlines" })).toBeNull();
  });
});
