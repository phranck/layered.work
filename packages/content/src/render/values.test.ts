import { describe, expect, it } from "vitest";
import { validateContent } from "../validate/validate.js";
import { renderContent } from "./render.js";
import { resolveValues } from "./values.js";

const VALUES = new Map([
  ["product", "Velvet"],
  ["version", "2.1"],
  ["tricky", "*not* [a link](https://example.invalid) Note(x) {{ product }}"],
]);

/** The text a rendered body shows, with every element's tags taken off. */
function shown(source: string): string {
  const walk = (nodes: ReturnType<typeof renderContent>): string =>
    nodes
      .map((node) => (node.kind === "text" ? node.value : node.kind === "element" ? walk(node.children) : ""))
      .join("");
  return walk(renderContent(source));
}

describe("resolving references to named values", () => {
  it("replaces each reference with its value's text", () => {
    expect(shown(resolveValues("Made with {{ product }} {{version}}.", VALUES))).toBe(
      "Made with Velvet 2.1.",
    );
  });

  it("keeps a value as text, whatever Markdown or component syntax it holds", () => {
    const resolved = resolveValues("{{ tricky }}", VALUES);
    const nodes = renderContent(resolved);
    expect(JSON.stringify(nodes)).not.toMatch(/"tag":"(em|a)"|"kind":"component"|"kind":"placeholder"/);
    expect(shown(resolved)).toBe("*not* [a link](https://example.invalid) Note(x) {{ product }}");
  });

  it("leaves references in code, escaped ones and unknown names as written", () => {
    const source = "`{{ product }}` and \\{{ product }} and {{ missing }}";
    expect(resolveValues(source, VALUES)).toBe(source);
  });

  it("replaces references inside a component's body", () => {
    expect(resolveValues("Note {\n  Made with {{ product }}.\n}", VALUES)).toBe(
      "Note {\n  Made with Velvet.\n}",
    );
  });
});

describe("a reference nothing resolved", () => {
  it("shows on the page as it was written", () => {
    expect(shown("Made with {{ product }}.")).toBe("Made with {{ product }}.");
  });
});

describe("checking references", () => {
  it("refuses a name no value has, and offers the nearest one", () => {
    const validation = validateContent("Made with {{ prodcut }}.", { values: new Set(VALUES.keys()) });
    expect(validation.publishable).toBe(false);
    expect(validation.findings).toMatchObject([
      { code: "unknown-value", value: "prodcut", suggestion: "product", from: 10, to: 23 },
    ]);
  });

  it("accepts a name a value has", () => {
    expect(validateContent("Made with {{ product }}.", { values: new Set(VALUES.keys()) }).findings).toEqual(
      [],
    );
  });

  it("takes references on trust when no names are given", () => {
    expect(validateContent("Made with {{ anything }}.").publishable).toBe(true);
  });
});
