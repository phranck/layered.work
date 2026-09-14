import { describe, expect, it } from "vitest";
import { COMPONENT_NAMES, type ComponentName } from "../register/components.js";
import type { RenderNode } from "./model.js";
import { renderContent } from "./render.js";

/**
 * What a document turns into.
 *
 * Small cases are compared as objects, because the shape is the thing under
 * test. Larger ones are compared as an outline, because a page written out as
 * nested objects is unreadable and a test nobody can read is a test nobody
 * checks.
 */

/** The model as indented lines: what each node is, and what it says. */
function outline(text: string, indent = ""): string {
  return renderContent(text)
    .map((node) => line(node, indent))
    .join("\n");
}

/** One node and everything under it. */
function line(node: RenderNode, indent: string): string {
  switch (node.kind) {
    case "text":
      return `${indent}text ${JSON.stringify(node.value)}`;
    case "code":
      return `${indent}code ${node.language ?? "-"} ${JSON.stringify(node.source)}`;
    case "placeholder":
      return `${indent}placeholder ${node.name}`;
    case "element":
      return [`${indent}${node.tag}${attributes(node.attributes)}`, ...children(node.children, indent)].join(
        "\n",
      );
    case "component":
      return [
        `${indent}${node.name} → ${node.renders} ${props(node.props)}`,
        ...children(node.children, indent),
      ].join("\n");
  }
}

/** The lines of everything inside a node. */
function children(nodes: RenderNode[], indent: string): string[] {
  return nodes.map((child) => line(child, `${indent}  `));
}

/**
 * A component's props, by name.
 *
 * Sorted, because the order they were written in is not something anything
 * depends on: a test that fired on it would be firing on a decision rather than
 * on a defect.
 */
function props(values: Readonly<Record<string, string | number | boolean>>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(values).sort()));
}

/** An element's attributes, where it has any. */
function attributes(values: Readonly<Record<string, string>>): string {
  const written = Object.entries(values).map(([name, value]) => ` ${name}=${JSON.stringify(value)}`);
  return written.join("");
}

describe("prose", () => {
  it("makes a paragraph of a paragraph", () => {
    expect(renderContent("Ein Absatz.\n")).toEqual([
      { kind: "element", tag: "p", attributes: {}, children: [{ kind: "text", value: "Ein Absatz." }] },
    ]);
  });

  it("keeps the words around what is marked up", () => {
    expect(outline("Text mit *kursiv* darin.\n")).toBe(
      ["p", '  text "Text mit "', "  em", '    text "kursiv"', '  text " darin."'].join("\n"),
    );
  });

  it("takes the marks off a heading and the space with them", () => {
    expect(outline("## Ein Titel\n")).toBe(["h2", '  text "Ein Titel"'].join("\n"));
  });

  it("reads a heading written with a line under it", () => {
    expect(outline("Titel\n=====\n")).toBe(["h1", '  text "Titel"'].join("\n"));
  });

  it("renders strong, struck out and inline code", () => {
    expect(outline("**fett** ~~weg~~ `code`\n")).toBe(
      [
        "p",
        "  strong",
        '    text "fett"',
        '  text " "',
        "  del",
        '    text "weg"',
        '  text " "',
        "  code",
        '    text "code"',
      ].join("\n"),
    );
  });

  it("renders a list", () => {
    expect(outline("- Eins\n- Zwei\n")).toBe(
      ["ul", "  li", "    p", '      text "Eins"', "  li", "    p", '      text "Zwei"'].join("\n"),
    );
  });

  it("marks a list item that is something to tick off", () => {
    expect(outline("- [x] fertig\n- [ ] offen\n")).toBe(
      ["ul", '  li data-task="done"', '    text "fertig"', '  li data-task="open"', '    text "offen"'].join(
        "\n",
      ),
    );
  });

  it("renders a quotation and a rule", () => {
    expect(outline("> Zitat\n\n---\n")).toBe(["blockquote", "  p", '    text "Zitat"', "hr"].join("\n"));
  });

  it("drops the blank line between two blocks", () => {
    expect(renderContent("Eins.\n\nZwei.\n").map((node) => node.kind)).toEqual(["element", "element"]);
  });
});

describe("code", () => {
  it("keeps the language and the source of a fence", () => {
    expect(renderContent("```ts\nconst a = 1;\n```\n")).toEqual([
      { kind: "code", language: "ts", source: "const a = 1;" },
    ]);
  });

  it("has no language when the fence gives none", () => {
    expect(renderContent("```\nroh\n```\n")).toEqual([{ kind: "code", source: "roh" }]);
  });

  it("reads an indented block as code as well", () => {
    expect(renderContent("    const a = 1;\n")).toEqual([{ kind: "code", source: "const a = 1;" }]);
  });
});

describe("a table", () => {
  it("tells the head from the body", () => {
    expect(outline("| a | b |\n| --- | --- |\n| 1 | 2 |\n")).toBe(
      [
        "table",
        "  thead",
        "    tr",
        "      th",
        '        text "a"',
        "      th",
        '        text "b"',
        "  tbody",
        "    tr",
        "      td",
        '        text "1"',
        "      td",
        '        text "2"',
      ].join("\n"),
    );
  });
});

describe("a link", () => {
  it("becomes an anchor", () => {
    expect(outline("[Wort](https://x.invalid)\n")).toBe(
      ["p", '  a href="https://x.invalid"', '    text "Wort"'].join("\n"),
    );
  });

  it("keeps what is marked up inside its label", () => {
    expect(outline("[ein *schräges* Wort](https://x.invalid)\n")).toBe(
      [
        "p",
        '  a href="https://x.invalid"',
        '    text "ein "',
        "    em",
        '      text "schräges"',
        '    text " Wort"',
      ].join("\n"),
    );
  });

  it("follows a definition written elsewhere", () => {
    expect(outline("Ein [Wort][ziel].\n\n[ziel]: https://x.invalid\n")).toBe(
      ["p", '  text "Ein "', '  a href="https://x.invalid"', '    text "Wort"', '  text "."'].join("\n"),
    );
  });

  it("follows a definition under its own name", () => {
    expect(outline("Ein [ziel] hier.\n\n[ziel]: https://x.invalid\n")).toBe(
      ["p", '  text "Ein "', '  a href="https://x.invalid"', '    text "ziel"', '  text " hier."'].join("\n"),
    );
  });

  it("is words alone when nothing says where it goes", () => {
    expect(outline("Ein [Wort][fehlt] hier.\n")).toBe(
      ["p", '  text "Ein "', '  text "Wort"', '  text " hier."'].join("\n"),
    );
  });

  it("makes an anchor of a bare address", () => {
    expect(outline("Siehe https://x.invalid dort.\n")).toBe(
      [
        "p",
        '  text "Siehe "',
        '  a href="https://x.invalid"',
        '    text "https://x.invalid"',
        '  text " dort."',
      ].join("\n"),
    );
  });

  it("renders a Markdown picture with its alt text", () => {
    expect(outline("![Die Front](bild.png)\n")).toBe(
      ["p", '  img src="bild.png" alt="Die Front"'].join("\n"),
    );
  });
});

describe("what somebody typed", () => {
  it("renders a script tag as text, and as no element", () => {
    const nodes = renderContent("<script>alert(1)</script>\n");

    expect(nodes).toEqual([{ kind: "text", value: "<script>alert(1)</script>" }]);
  });

  it("renders a tag inside a sentence as text", () => {
    expect(outline("Text <b>fett</b> mehr.\n")).toBe(
      ["p", '  text "Text "', '  text "<b>"', '  text "fett"', '  text "</b>"', '  text " mehr."'].join("\n"),
    );
  });

  it("renders a comment, rather than hiding what somebody wrote", () => {
    // A comment is HTML and follows the same rule as the rest of it. Dropping
    // it would be the one behaviour that loses text without saying so, and an
    // author who wants a note that nobody sees has the draft for that.
    expect(renderContent("<!-- eine Notiz -->\n")).toEqual([{ kind: "text", value: "<!-- eine Notiz -->" }]);
  });

  it("takes the backslash off an escape", () => {
    expect(outline("Ein \\* Stern.\n")).toBe(
      ["p", '  text "Ein "', '  text "*"', '  text " Stern."'].join("\n"),
    );
  });

  it("decodes the entities it knows and leaves the rest alone", () => {
    expect(outline("&amp; &#228; &#xE4; &auml;\n")).toBe(
      [
        "p",
        '  text "&"',
        '  text " "',
        '  text "ä"',
        '  text " "',
        '  text "ä"',
        '  text " "',
        '  text "&auml;"',
      ].join("\n"),
    );
  });
});

describe("a component", () => {
  it("carries what draws it and every prop the register gives", () => {
    expect(renderContent("Note(tone: warning) { Vorsicht. }")).toEqual([
      {
        kind: "component",
        name: "Note",
        renders: "Note",
        props: { tone: "warning" },
        children: [
          { kind: "element", tag: "p", attributes: {}, children: [{ kind: "text", value: "Vorsicht. " }] },
        ],
      },
    ]);
  });

  it("fills in what was not written", () => {
    expect(outline("VStack {\n  Hallo.\n}\n")).toBe(
      ['VStack → Stack {"align":"stretch","spacing":"5"}', "  p", '    text "Hallo."'].join("\n"),
    );
  });

  it("binds the value written first without a name", () => {
    expect(outline('Image("soundbox-front", caption: "Die Front")')).toBe(
      'Image → Figure {"caption":"Die Front","slug":"soundbox-front"}',
    );
  });

  it("keeps a step as the name it is", () => {
    expect(outline("HStack(spacing: 6, wrap: false) {\n  Hallo.\n}\n")).toBe(
      [
        'HStack → Stack {"align":"stretch","spacing":"6","wrap":false}',
        'VStack → Stack {"align":"stretch","spacing":"5"}',
        "  p",
        '    text "Hallo."',
      ]
        .map((entry, index) => (index === 0 ? entry : `  ${entry}`))
        .join("\n"),
    );
  });

  it("keeps the first value written without a name, and not the second", () => {
    // The validator refuses the second one. What must not happen meanwhile is
    // that it quietly replaces the first, which is what a draft would render.
    expect(outline('Image("assembly", "soundbox-front")')).toBe('Image → Figure {"slug":"assembly"}');
  });

  it("becomes a placeholder when the register knows no such name", () => {
    expect(renderContent("Carousel {\n  Bilder.\n}\n")).toEqual([{ kind: "placeholder", name: "Carousel" }]);
  });

  it("becomes a placeholder when it was never closed", () => {
    expect(renderContent("Note(tone: warning) {\n  Vorsicht.\n")).toEqual([
      { kind: "placeholder", name: "Note" },
    ]);
  });
});

describe("every component the register declares", () => {
  /**
   * The smallest document that draws each one, and what it becomes.
   *
   * Written out rather than derived, so that a component added to the register
   * fails the first test below until somebody has decided what it renders as.
   */
  const EXAMPLES: Record<ComponentName, [written: string, expected: string[]]> = {
    VStack: [
      "VStack {\n  Hallo.\n}",
      ['VStack → Stack {"align":"stretch","spacing":"5"}', "  p", '    text "Hallo."'],
    ],
    HStack: [
      "HStack {\n  Hallo.\n}",
      [
        'HStack → Stack {"align":"stretch","spacing":"5","wrap":true}',
        '  VStack → Stack {"align":"stretch","spacing":"5"}',
        "    p",
        '      text "Hallo."',
      ],
    ],
    Grid: ["Grid {\n  Hallo.\n}", ['Grid → Grid {"columns":2,"spacing":"5"}', "  p", '    text "Hallo."']],
    Spacer: ["Spacer(3)", ['Spacer → Spacer {"size":"3"}']],
    Divider: ["Divider()", ["Divider → Divider {}"]],
    Image: [
      'Image("front", caption: "Die Front")',
      ['Image → Figure {"caption":"Die Front","slug":"front"}'],
    ],
    Gallery: [
      'Gallery {\n  Image("front")\n}',
      ['Gallery → Gallery {"columns":3,"spacing":"5"}', '  Image → Figure {"slug":"front"}'],
    ],
    Model: ['Model("cube", alt: "Ein Würfel")', ['Model → Model {"alt":"Ein Würfel","slug":"cube"}']],
    Video: ['Video("film", poster: "front")', ['Video → Video {"poster":"front","slug":"film"}']],
    Pdf: [
      'Pdf("anleitung", label: "Anleitung")',
      ['Pdf → Document {"label":"Anleitung","slug":"anleitung"}'],
    ],
    Note: [
      "Note(tone: warning) {\n  Vorsicht.\n}",
      ['Note → Note {"tone":"warning"}', "  p", '    text "Vorsicht."'],
    ],
    Button: [
      'Button("Ansehen", href: "#hier")',
      ['Button → Button {"href":"#hier","label":"Ansehen","tone":"secondary"}'],
    ],
    Card: [
      'Card(title: "Titel") {\n  Inhalt.\n}',
      ['Card → Card {"title":"Titel"}', "  p", '    text "Inhalt."'],
    ],
  };

  it("has an example of each of them", () => {
    expect(Object.keys(EXAMPLES).sort()).toEqual([...COMPONENT_NAMES].sort());
  });

  it.each(Object.entries(EXAMPLES))("draws %s", (_name, [written, expected]) => {
    expect(outline(written)).toBe(expected.join("\n"));
  });
});

describe("a run of prose beside a component", () => {
  it("becomes one column rather than several", () => {
    const text = ["HStack {", '  Image("soundbox-front")', "  ## Gehäuse", "", "  Zwei Hälften.", "}"].join(
      "\n",
    );

    expect(outline(text)).toBe(
      [
        'HStack → Stack {"align":"stretch","spacing":"5","wrap":true}',
        '  Image → Figure {"slug":"soundbox-front"}',
        '  VStack → Stack {"align":"stretch","spacing":"5"}',
        "    h2",
        '      text "Gehäuse"',
        "    p",
        '      text "Zwei Hälften."',
      ].join("\n"),
    );
  });

  it("is left alone in a vertical stack, which is already one column", () => {
    const text = ["VStack {", '  Image("soundbox-front")', "", "  Zwei Hälften.", "}"].join("\n");

    expect(outline(text)).toBe(
      [
        'VStack → Stack {"align":"stretch","spacing":"5"}',
        '  Image → Figure {"slug":"soundbox-front"}',
        "  p",
        '    text "Zwei Hälften."',
      ].join("\n"),
    );
  });
});

describe("the example the epic is written around", () => {
  const text = [
    "HStack(spacing: 6, align: top) {",
    '  Image("soundbox-front", caption: "Die Front")',
    "  VStack {",
    "    ## Gehäuse",
    "",
    "    Zwei Hälften aus PETG.",
    "",
    "    Spacer()",
    '    Button("Modell ansehen", href: "#modell", icon: cube, tone: primary)',
    "  }",
    "}",
    "",
    'Model("next-soundbox", alt: "NeXT SoundBox mini")',
  ].join("\n");

  it("is two columns at the top, and the second holds four things", () => {
    expect(outline(text)).toBe(
      [
        'HStack → Stack {"align":"top","spacing":"6","wrap":true}',
        '  Image → Figure {"caption":"Die Front","slug":"soundbox-front"}',
        '  VStack → Stack {"align":"stretch","spacing":"5"}',
        "    h2",
        '      text "Gehäuse"',
        "    p",
        '      text "Zwei Hälften aus PETG."',
        "    Spacer → Spacer {}",
        '    Button → Button {"href":"#modell","icon":"cube","label":"Modell ansehen","tone":"primary"}',
        'Model → Model {"alt":"NeXT SoundBox mini","slug":"next-soundbox"}',
      ].join("\n"),
    );
  });
});
