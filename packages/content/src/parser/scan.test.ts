import { describe, expect, it } from "vitest";
import { scanComponent, startsComponent } from "./scan.js";

/**
 * Finding where a component starts and where it ends.
 *
 * Every case here is a place a brace or a comma is not what it looks like.
 * The grammar has three forms; the work is entirely in the counting.
 */

/** Scans from the first non-whitespace character, which is what the block parser hands it. */
function scan(text: string) {
  return scanComponent(text, text.length - text.trimStart().length);
}

describe("what starts a component", () => {
  it.each([
    ["a call with arguments", 'Image("a")'],
    ["a call with a body", "VStack { x }"],
    ["a call with both", "Note(tone: info) { x }"],
    ["a bracket with no gap", "Spacer()"],
    ["a brace with no gap", "VStack{ x }"],
  ])("%s does", (_what, text) => {
    expect(startsComponent(text, 0)).toBe(true);
  });

  it.each([
    ["a sentence that begins with a capital", "Image files are large."],
    ["a lower-case name", 'image("a")'],
    ["a name with an underscore", 'Some_thing("a")'],
    ["a heading", "## Gehäuse"],
    ["a capitalised word followed by a full stop", "Image."],
  ])("%s does not", (_what, text) => {
    expect(startsComponent(text, 0)).toBe(false);
  });

  it("does not, when the line is escaped", () => {
    // The escape the epic gives for a paragraph that genuinely starts this way.
    const text = '\\Image("a")';
    expect(startsComponent(text, 1)).toBe(false);
  });
});

describe("a call with arguments", () => {
  it("reads the one written first without a name", () => {
    const found = scan('Image("soundbox-front")');
    expect(found?.arguments?.items).toHaveLength(1);
    expect(found?.arguments?.items[0]?.name).toBeUndefined();
    expect(found?.arguments?.items[0]?.value.text).toBe('"soundbox-front"');
    expect(found?.arguments?.items[0]?.value.kind).toBe("string");
  });

  it("reads a named one", () => {
    const found = scan('Image("a", caption: "Die Front")');
    const [first, second] = found?.arguments?.items ?? [];
    expect(first?.name).toBeUndefined();
    expect(second?.name?.text).toBe("caption");
    expect(second?.value.text).toBe('"Die Front"');
  });

  it("tells a number from a keyword from a string", () => {
    const found = scan('HStack(spacing: 6, align: top, label: "six")');
    const kinds = found?.arguments?.items.map((item) => item.value.kind);
    expect(kinds).toEqual(["number", "keyword", "string"]);
  });

  it("does not split on a comma inside a string", () => {
    const found = scan('Image("a", caption: "Front, hinten und oben")');
    expect(found?.arguments?.items).toHaveLength(2);
    expect(found?.arguments?.items[1]?.value.text).toBe('"Front, hinten und oben"');
  });

  it("does not treat the colon of an address as a name", () => {
    const found = scan('Button("Ansehen", href: "https://example.invalid/a")');
    expect(found?.arguments?.items[1]?.name?.text).toBe("href");
    expect(found?.arguments?.items[1]?.value.text).toBe('"https://example.invalid/a"');
  });

  it("reads no arguments at all from empty brackets", () => {
    const found = scan("Spacer()");
    expect(found?.arguments?.items).toHaveLength(0);
    expect(found?.body).toBeUndefined();
  });

  it("tolerates a trailing comma", () => {
    const found = scan('Image("a", caption: "b",)');
    expect(found?.arguments?.items).toHaveLength(2);
  });

  it("reports a bracket that is never closed, and says where", () => {
    const found = scan('Image("a"\n\nAnd the text carries on.');
    expect(found?.error?.code).toBe("unclosed-arguments");
    expect(found?.error?.at).toBe(5);
  });
});

describe("a call with a body", () => {
  it("takes everything between the braces", () => {
    const found = scan("Note { Careful with that. }");
    expect(found?.body?.text).toBe(" Careful with that. ");
  });

  it("counts nesting, so an inner component keeps its own brace", () => {
    const text = "VStack {\n  HStack {\n    x\n  }\n  y\n}";
    const found = scan(text);
    expect(found?.to).toBe(text.length);
    expect(found?.body?.text).toContain("HStack {");
    expect(found?.body?.text).toContain("y");
  });

  it("ignores a closing bracket inside a string", () => {
    // What quote handling in the argument scan actually protects. A brace in
    // there changes nothing, because a brace is not what closes a bracket.
    const found = scan('Button("Press me :)", href: "/a")');
    expect(found?.arguments?.items).toHaveLength(2);
    expect(found?.arguments?.items[0]?.value.text).toBe('"Press me :)"');
    expect(found?.arguments?.items[1]?.value.text).toBe('"/a"');
  });

  it("does not ignore a brace inside quotation marks in the body", () => {
    // A body is Markdown, where a double quote is a quotation mark. Treating it
    // as a delimiter would make `He said "look }" and left.` behave differently
    // from the same sentence without the quotes, which nobody would predict.
    const found = scan('Note { He said "look } and left. }');
    expect(found?.body?.text).toBe(' He said "look ');
  });

  it("lets a body hold a brace when it is escaped", () => {
    const found = scan("Note { A literal \\} in the prose. }");
    expect(found?.body?.text).toBe(" A literal \\} in the prose. ");
  });

  it("ignores a brace inside a fenced code block", () => {
    // The rule the epic states as fenced code being recognised first. The
    // example is deliberately unbalanced: a balanced one closes at the right
    // place by accident, whether the fence is understood or not, and a test
    // built on it proves nothing.
    const text = "Note {\n\n```text\n}\n```\n\nAfter the fence.\n}";
    const found = scan(text);
    expect(found?.to).toBe(text.length);
    expect(found?.body?.text).toContain("After the fence.");
  });

  it("reports a brace that is never closed, and says where", () => {
    const text = "VStack {\n  Some text that carries on\n";
    const found = scan(text);
    expect(found?.error?.code).toBe("unclosed-body");
    expect(found?.error?.at).toBe(7);
  });

  it("reads arguments and a body together", () => {
    const found = scan("Note(tone: warning) { Das Image braucht 16 GB. }");
    expect(found?.arguments?.items[0]?.name?.text).toBe("tone");
    expect(found?.arguments?.items[0]?.value.text).toBe("warning");
    expect(found?.body?.text).toBe(" Das Image braucht 16 GB. ");
  });
});

describe("where it ends", () => {
  it("stops at the closing bracket when there is no body", () => {
    const text = 'Image("a")\n\nA paragraph after it.';
    const found = scan(text);
    expect(text.slice(found?.from, found?.to)).toBe('Image("a")');
  });

  it("stops at the closing brace, leaving what follows alone", () => {
    const text = "Note { inside }\n\nA paragraph after it.";
    const found = scan(text);
    expect(text.slice(found?.from, found?.to)).toBe("Note { inside }");
  });

  it("locates the name, so something else can point at it", () => {
    const found = scan('  Image("a")');
    expect(found?.name.from).toBe(2);
    expect(found?.name.to).toBe(7);
    expect(found?.name.text).toBe("Image");
  });
});

describe("the example the epic gives", () => {
  const example = `HStack(spacing: 6, align: top) {
  Image("soundbox-front", caption: "Die Front")
  VStack {
    ## Gehäuse

    Zwei Hälften aus PETG, die Lüfterschlitze sind gedruckt.

    Spacer()
    Button("Modell ansehen", href: "#modell", icon: cube, tone: primary)
  }
}`;

  it("is one component, from the first character to the last", () => {
    const found = scan(example);
    expect(found?.name.text).toBe("HStack");
    expect(found?.from).toBe(0);
    expect(found?.to).toBe(example.length);
  });

  it("reads its two arguments", () => {
    const found = scan(example);
    expect(found?.arguments?.items.map((item) => [item.name?.text, item.value.text])).toEqual([
      ["spacing", "6"],
      ["align", "top"],
    ]);
  });

  it("keeps the whole of its body, headings and all", () => {
    const found = scan(example);
    expect(found?.body?.text).toContain("## Gehäuse");
    expect(found?.body?.text).toContain("Spacer()");
    expect(found?.body?.text).toContain("tone: primary");
  });
});
