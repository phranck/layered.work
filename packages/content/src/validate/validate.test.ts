import { describe, expect, it } from "vitest";
import type { Register } from "../register/kinds.js";
import { FINDING } from "./findings.js";
import { type ValidateOptions, validateContent } from "./validate.js";

/**
 * What the validator says about a document.
 *
 * Each test asserts the code, the position, and the sentence a person sees.
 * The sentence is part of it rather than an afterthought: a message naming the
 * wrong parameter is as wrong as no message, and nothing else would catch it.
 */

/** The library these tests pretend exists. */
const MEDIA = new Set(["soundbox-front", "next-soundbox", "assembly"]);

/** Everything found, with the options the tests usually want. */
function findingsIn(text: string, options: ValidateOptions = { media: MEDIA }) {
  return validateContent(text, options).findings;
}

/** The one finding, where a test expects exactly one. */
function onlyFinding(text: string, options: ValidateOptions = { media: MEDIA }) {
  const found = findingsIn(text, options);
  expect(found).toHaveLength(1);
  return found[0];
}

describe("an unknown component", () => {
  it("is refused and named", () => {
    const finding = onlyFinding("Carousel {\n  Pictures.\n}\n");

    expect(finding).toMatchObject({
      code: FINDING.UnknownComponent,
      severity: "error",
      message: "Carousel is not a component.",
      line: 1,
      column: 1,
      component: "Carousel",
    });
  });

  it("offers the nearest name when there is one", () => {
    expect(onlyFinding("VStac {\n  Hi.\n}\n")).toMatchObject({
      message: "VStac is not a component. Did you mean VStack?",
      suggestion: "VStack",
    });
  });

  it("stops the document being published", () => {
    expect(validateContent("Carousel {\n  Pictures.\n}\n").publishable).toBe(false);
  });
});

describe("a name the register has retired", () => {
  /** The real register deprecates nothing yet, so this is what one looks like. */
  const retired: Register = {
    Note: {
      description: "Something set apart from the text around it.",
      example: "Note(tone: warning) { Careful. }",
      body: "required",
      parameters: {
        tone: { kind: "keyword", description: "What kind of thing it is.", values: ["info", "warning"] },
      },
      renders: "Note",
      aliases: [{ was: "Callout", message: "Callout is now called Note." }],
    },
  };

  it("is a warning rather than an error", () => {
    expect(onlyFinding("Callout { Careful. }", { register: retired })).toMatchObject({
      code: FINDING.DeprecatedComponent,
      severity: "warning",
      message: "Callout is now called Note.",
      component: "Note",
      value: "Callout",
    });
  });

  it("does not stop the document being published", () => {
    expect(validateContent("Callout { Careful. }", { register: retired }).publishable).toBe(true);
  });
});

describe("a parameter the component does not have", () => {
  it("is refused, with the nearest one offered", () => {
    expect(onlyFinding('Image("assembly", captoin: "Zusammenbau")')).toMatchObject({
      code: FINDING.UnknownParameter,
      severity: "error",
      message: "Image has no parameter called captoin. Did you mean caption?",
      line: 1,
      column: 19,
      component: "Image",
      parameter: "captoin",
      suggestion: "caption",
    });
  });
});

describe("a value the parameter does not take", () => {
  it("names what it does take", () => {
    expect(onlyFinding("Note(tone: excited) { Careful. }")).toMatchObject({
      code: FINDING.ValueNotPermitted,
      message: "excited is not a value for tone, which takes one of success, info, warning, or danger.",
      line: 1,
      column: 12,
      component: "Note",
      parameter: "tone",
      value: "excited",
    });
  });

  it("refuses a number outside the range", () => {
    expect(onlyFinding("Grid(columns: 9) {\n  Hi.\n}\n")).toMatchObject({
      code: FINDING.ValueNotPermitted,
      message: "9 is not a value for columns, which takes a whole number from 1 to 6.",
    });
  });

  it("refuses a step that is not on the scale", () => {
    expect(onlyFinding("VStack(spacing: 99) {\n  Hi.\n}\n")).toMatchObject({
      code: FINDING.ValueNotPermitted,
      message: "99 is not a value for spacing, which takes a step of the space scale, from 1 to 10.",
    });
  });

  it("refuses a word where a flag belongs", () => {
    expect(onlyFinding("HStack(wrap: yes) { Hi. }")).toMatchObject({
      code: FINDING.ValueNotPermitted,
      message: "yes is not a value for wrap, which takes true or false.",
    });
  });

  it("refuses text written without quotes", () => {
    expect(onlyFinding('Image("assembly", caption: Zusammenbau)')).toMatchObject({
      code: FINDING.ValueNotPermitted,
      message: "Zusammenbau is not a value for caption, which takes text in quotes.",
    });
  });

  it("accepts a flag, a step and a keyword that are right", () => {
    expect(findingsIn("HStack(spacing: 6, align: top, wrap: false) {\n  Hi.\n}\n")).toEqual([]);
  });
});

describe("a parameter the component cannot be written without", () => {
  it("is reported against the component, because there is no argument to point at", () => {
    expect(onlyFinding("Image()")).toMatchObject({
      code: FINDING.MissingParameter,
      message: "Image is missing slug.",
      line: 1,
      column: 1,
      component: "Image",
      parameter: "slug",
    });
  });

  it("is satisfied by the value written first without a name", () => {
    expect(findingsIn('Image("assembly")')).toEqual([]);
  });
});

describe("a body", () => {
  it("is refused on a component that holds nothing", () => {
    expect(onlyFinding("Spacer(3) { Hi. }")).toMatchObject({
      code: FINDING.BodyNotAccepted,
      message: "Spacer takes no body.",
      component: "Spacer",
    });
  });

  it("is insisted on for a component that exists to hold something", () => {
    expect(onlyFinding("VStack(spacing: 4)")).toMatchObject({
      code: FINDING.MissingBody,
      message: "VStack needs a body.",
      line: 1,
      column: 1,
      component: "VStack",
    });
  });
});

describe("a brace that is never closed", () => {
  const text = "Note(tone: warning) {\n  Careful with that.\n";

  it("points at the brace itself", () => {
    expect(onlyFinding(text)).toMatchObject({
      code: FINDING.Unclosed,
      message: "Note has a body that is never closed.",
      line: 1,
      column: 21,
      component: "Note",
    });
  });

  it("says nothing else about the component", () => {
    // Read no further than the opening brace, a component is also missing its
    // body and everything after it. One message about one brace is the point.
    expect(findingsIn(text).map((finding) => finding.code)).toEqual([FINDING.Unclosed]);
  });

  it("reports a bracket that is never closed as well", () => {
    expect(onlyFinding('Image("assembly"\n\nAnd on we go.\n')).toMatchObject({
      code: FINDING.Unclosed,
      message: "Image has a bracket that is never closed.",
      line: 1,
      column: 6,
    });
  });
});

describe("a media name", () => {
  it("is refused when the library has nothing under it", () => {
    expect(onlyFinding('Image("soundbox-frnt")')).toMatchObject({
      code: FINDING.UnknownMedia,
      message: "The media library has no file called soundbox-frnt. Did you mean soundbox-front?",
      line: 1,
      column: 7,
      component: "Image",
      parameter: "slug",
      value: "soundbox-frnt",
      suggestion: "soundbox-front",
    });
  });

  it("is taken on trust when nothing knows what exists", () => {
    expect(findingsIn('Image("soundbox-frnt")', {})).toEqual([]);
  });
});

describe("a value written without a name", () => {
  it("is refused where the component takes none", () => {
    expect(onlyFinding('Note("Careful") { Careful. }')).toMatchObject({
      code: FINDING.UnnamedNotAccepted,
      message: "Note takes no value written first without a name.",
      component: "Note",
      value: '"Careful"',
    });
  });

  it("is refused a second time", () => {
    expect(onlyFinding('Image("assembly", "soundbox-front")')).toMatchObject({
      code: FINDING.UnnamedNotAccepted,
      message: "Only one value may be written without a name, and Image already has one.",
    });
  });
});

describe("the same parameter twice", () => {
  it("is refused, because the second would silently win", () => {
    expect(onlyFinding("Note(tone: info, tone: warning) { Careful. }")).toMatchObject({
      code: FINDING.DuplicateParameter,
      message: "tone is written twice.",
      line: 1,
      column: 18,
      parameter: "tone",
    });
  });

  it("counts the value written without a name as the parameter it binds to", () => {
    expect(onlyFinding('Image("assembly", slug: "soundbox-front")')).toMatchObject({
      code: FINDING.DuplicateParameter,
      message: "slug is written twice.",
    });
  });
});

describe("where a finding sits", () => {
  it("counts lines and columns from one", () => {
    const text = ["# Gehäuse", "", "Note(tone: excited) { Careful. }"].join("\n");

    expect(onlyFinding(text)).toMatchObject({ line: 3, column: 12, value: "excited" });
  });

  it("points into the document rather than into the dedented body", () => {
    const text = ["VStack {", "  Note(tone: excited) {", "    Careful.", "  }", "}"].join("\n");

    expect(onlyFinding(text)).toMatchObject({ line: 2, column: 14, value: "excited" });
  });

  it("reports in document order", () => {
    const text = ["Note(tone: excited) { A. }", "", "Grid(columns: 9) { B. }"].join("\n");

    expect(findingsIn(text).map((finding) => finding.line)).toEqual([1, 3]);
  });

  it("reports in document order within one component as well", () => {
    // The body is checked before the arguments, and it comes after them, so
    // what is found is not what is reported first.
    const text = "Spacer(99) { Hi. }";

    expect(findingsIn(text).map((finding) => finding.column)).toEqual([8, 13]);
  });
});

describe("the example the epic is written around", () => {
  const text = [
    "HStack(spacing: 6, align: top) {",
    '  Image("soundbox-front", caption: "Die Front")',
    "  VStack {",
    "    ## Gehäuse",
    "",
    "    Zwei Hälften aus PETG, die Lüfterschlitze sind gedruckt.",
    "",
    "    Spacer()",
    '    Button("Modell ansehen", href: "#modell", icon: cube, tone: primary)',
    "  }",
    "}",
    "",
    'Model("next-soundbox", alt: "NeXT SoundBox mini")',
    "",
    "Note(tone: warning) { Das Image braucht eine Karte mit mindestens 16 GB. }",
  ].join("\n");

  it("has nothing wrong with it", () => {
    expect(findingsIn(text)).toEqual([]);
  });

  it("may be published", () => {
    expect(validateContent(text, { media: MEDIA }).publishable).toBe(true);
  });
});

describe("plain Markdown", () => {
  it("is left alone", () => {
    const text = [
      "# Ein Titel",
      "",
      "Ein Absatz mit einem [Link](https://layered.work) darin.",
      "",
      "```ts",
      "const Note = { tone: 'nonsense' };",
      "```",
      "",
      "- Eins",
      "- Zwei",
    ].join("\n");

    expect(findingsIn(text)).toEqual([]);
  });
});
