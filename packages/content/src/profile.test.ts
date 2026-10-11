import { describe, expect, it } from "vitest";
import type { RenderNode } from "./render/model.js";
import { renderInline } from "./render/render.js";
import { validateContent } from "./validate/validate.js";

/** What a text in a profile is refused for, as the constructs named. */
function refused(text: string, profile: "mail" | "inline"): (string | undefined)[] {
  return validateContent(text, { profile }).findings.map((finding) => finding.construct);
}

/** The words rendered nodes show, with every element's tags taken off. */
function shown(nodes: readonly RenderNode[]): string {
  return nodes
    .map((node) => (node.kind === "text" ? node.value : node.kind === "element" ? shown(node.children) : ""))
    .join("");
}

/** Every tag in rendered nodes, at any depth. */
function tags(nodes: readonly RenderNode[]): string[] {
  return nodes.flatMap((node) => (node.kind === "element" ? [node.tag, ...tags(node.children)] : []));
}

describe("the inline profile", () => {
  it("admits emphasis, strong emphasis, links, bare addresses, escapes, entities and line breaks", () => {
    expect(
      refused(
        "*Eins*, **zwei**, [drei](https://example.invalid), https://example.invalid, \\*, &amp; und  \nvier",
        "inline",
      ),
    ).toEqual([]);
  });

  it("refuses a heading, a list, a quote, code, a picture and a named value, each as what it is", () => {
    expect(refused("# Titel", "inline")).toEqual(["heading"]);
    expect(refused("- eins\n- zwei", "inline")).toEqual(["list"]);
    expect(refused("`code`", "inline")).toEqual(["code"]);
    expect(refused("![Bild](front.jpg)", "inline")).toEqual(["image"]);
    expect(refused("Mit {{ product }}", "inline")).toEqual(["value"]);
  });

  it("reports a refused construct once, and nothing written inside it", () => {
    expect(refused("> Ein *Zitat* mit [Link](https://example.invalid)", "inline")).toEqual(["quote"]);
  });

  it("says in English what cannot be written", () => {
    expect(validateContent("# Titel", { profile: "inline" }).findings).toMatchObject([
      {
        code: "not-in-profile",
        severity: "error",
        message: "A heading cannot be written here.",
        from: 0,
        to: 7,
      },
    ]);
  });

  it("reads a line shaped like a component as words", () => {
    expect(validateContent("Prototyp(2)").findings.map((finding) => finding.code)).toContain(
      "unknown-component",
    );
    expect(refused("Prototyp(2)", "inline")).toEqual([]);
    expect(shown(renderInline("Prototyp(2)"))).toBe("Prototyp(2)");
  });
});

describe("the mail profile", () => {
  const PLACEHOLDERS = new Set(["formName", "submittedAt", "fields"]);

  it("admits paragraphs, lists, emphasis, links and the template's placeholders", () => {
    const text =
      "Danke für **{{formName}}** am {{ submittedAt }}.\n\n{{fields}}\n\n- *eins*\n- [zwei](https://example.invalid)";
    expect(validateContent(text, { profile: "mail", values: PLACEHOLDERS }).findings).toEqual([]);
  });

  it("reads a placeholder named with capitals as one, and refuses one the template does not have", () => {
    expect(
      validateContent("Für {{formNam}}", { profile: "mail", values: PLACEHOLDERS }).findings,
    ).toMatchObject([{ code: "unknown-value", value: "formNam", suggestion: "formName", from: 4, to: 15 }]);
  });

  it("leaves a placeholder's braces as words outside a mail", () => {
    expect(refused("Für {{formName}}", "inline")).toEqual([]);
    expect(shown(renderInline("Für {{formName}}"))).toBe("Für {{formName}}");
  });

  it("refuses an address outside a link, a heading and a line break, which a mail does not draw", () => {
    expect(refused("Siehe https://example.invalid", "mail")).toEqual(["address"]);
    expect(refused("## Titel", "mail")).toEqual(["heading"]);
    expect(refused("eins  \nzwei", "mail")).toEqual(["break"]);
  });
});

describe("the whole language", () => {
  it("refuses nothing a profile would", () => {
    expect(validateContent("# Titel\n\n- eins\n\n> Zitat").findings).toEqual([]);
  });
});

describe("rendering an inline text", () => {
  it("returns the words and their emphasis without a paragraph around them", () => {
    expect(renderInline("Hallo *Welt*")).toEqual([
      { kind: "text", value: "Hallo " },
      { kind: "element", tag: "em", attributes: {}, children: [{ kind: "text", value: "Welt" }] },
    ]);
  });

  it("keeps a link and where it points", () => {
    expect(renderInline("[Datenschutz](/de/datenschutz/)")).toEqual([
      {
        kind: "element",
        tag: "a",
        attributes: { href: "/de/datenschutz/" },
        children: [{ kind: "text", value: "Datenschutz" }],
      },
    ]);
  });

  it("joins paragraphs with a space", () => {
    const nodes = renderInline("Eins.\n\nZwei.");
    expect(tags(nodes)).toEqual([]);
    expect(shown(nodes)).toBe("Eins. Zwei.");
  });

  it("takes a block it does not admit apart into its words", () => {
    const nodes = renderInline("# Titel\n\n- eins\n- **zwei**\n\n```\nx = 1\n```");
    expect(tags(nodes)).toEqual(["strong"]);
    expect(shown(nodes)).toBe("Titel eins zwei x = 1");
  });

  it("keeps a line break", () => {
    expect(tags(renderInline("eins  \nzwei"))).toEqual(["br"]);
  });

  it("sets the quotation marks of the language it is written in", () => {
    expect(shown(renderInline('"Hallo"', { language: "de" }))).toBe("„Hallo“");
  });
});
