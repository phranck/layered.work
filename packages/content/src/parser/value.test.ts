import { describe, expect, it } from "vitest";
import { parseContent } from "./index.js";
import { NODE } from "./nodes.js";
import { OPEN_VALUE_REFERENCE, valueReferenceSource, writeValueReference } from "./value.js";

/** Every node of the given names, as the text it covers, in document order. */
function nodes(source: string, names: readonly string[]): string[] {
  const found: string[] = [];
  parseContent(source).iterate({
    enter: (node) => {
      if (names.includes(node.name)) found.push(`${node.name} ${source.slice(node.from, node.to)}`);
    },
  });
  return found;
}

const REFERENCE_NODES = [NODE.ValueReference, NODE.ValueName];

describe("a reference to a named value", () => {
  it("is its own node, with the name as a node inside it", () => {
    expect(nodes("Use {{ product }} and {{version-2}}.", REFERENCE_NODES)).toEqual([
      "ValueReference {{ product }}",
      "ValueName product",
      "ValueReference {{version-2}}",
      "ValueName version-2",
    ]);
  });

  it("does not turn the sentence it opens into a component", () => {
    expect(nodes("Hello {{ product }} here.", [NODE.Component, NODE.ComponentError])).toEqual([]);
    expect(nodes("Hello {{ product }} here.", [NODE.ValueReference])).toEqual([
      "ValueReference {{ product }}",
    ]);
  });

  it("is found inside a component's body", () => {
    expect(nodes("Note {\n  Made with {{ product }}.\n}", [NODE.Component, NODE.ValueName])).toEqual([
      "Component Note {\n  Made with {{ product }}.\n}",
      "ValueName product",
    ]);
  });

  it("stays text inside code", () => {
    expect(nodes("Write `{{ product }}` like this.", REFERENCE_NODES)).toEqual([]);
    expect(nodes("```\n{{ product }}\n```", REFERENCE_NODES)).toEqual([]);
  });

  it("is only a reference with a name in the value's shape between the braces", () => {
    expect(nodes("{{formName}} {{ Product }} {{ two words }} {{ }} {{-x}}", REFERENCE_NODES)).toEqual([]);
    expect(nodes(`{{ ${"a".repeat(49)} }}`, REFERENCE_NODES)).toEqual([]);
  });
});

describe("the shape of a reference, as the search and the editor read it", () => {
  it("matches one value's references however they are spaced, and no other name", () => {
    const text = "A {{ product-name }} b {{product-name}} c {{\tproduct-name }} d {{ product-names }}";
    expect(text.match(new RegExp(valueReferenceSource("product-name"), "g"))).toEqual([
      "{{ product-name }}",
      "{{product-name}}",
      "{{\tproduct-name }}",
    ]);
  });

  it("finds a reference still being typed at the end of a line, with the name so far", () => {
    expect(OPEN_VALUE_REFERENCE.exec("Made with {{ prod")?.[1]).toBe("prod");
    expect(OPEN_VALUE_REFERENCE.exec("Made with {{")?.[1]).toBe("");
    expect(OPEN_VALUE_REFERENCE.exec("Made with {{ product }}")).toBeNull();
  });

  it("writes a reference the parser reads back", () => {
    expect(nodes(`Use ${writeValueReference("product-name")}.`, [NODE.ValueName])).toEqual([
      "ValueName product-name",
    ]);
  });
});
