import { describe, expect, it } from "vitest";
import { parseContent } from "./index.js";
import { NODE } from "./nodes.js";

/**
 * What a document turns into.
 *
 * The tree is asserted as text rather than as an object, because what matters
 * is the shape and the positions, and a shape written out is the thing a person
 * reading the test can check against the document above it.
 */

/** The tree as indented lines, which is what these tests compare. */
function shape(text: string): string {
  const lines: string[] = [];
  const tree = parseContent(text);

  tree.iterate({
    enter(node) {
      lines.push(`${"  ".repeat(lines.length && node.node.parent ? depthOf(node.node) : 0)}${node.name}`);
    },
  });

  return lines.join("\n");
}

/** How deep a node sits, for the indentation above. */
function depthOf(node: { parent: unknown } | null): number {
  let depth = 0;
  let current = node as { parent: { parent: unknown } | null } | null;
  while (current?.parent) {
    depth += 1;
    current = current.parent as { parent: { parent: unknown } | null } | null;
  }
  return depth;
}

/** Every node of one type, with what it covers. */
function nodesOf(text: string, name: string): { from: number; to: number; text: string }[] {
  const found: { from: number; to: number; text: string }[] = [];
  parseContent(text).iterate({
    enter(node) {
      if (node.name === name)
        found.push({ from: node.from, to: node.to, text: text.slice(node.from, node.to) });
    },
  });
  return found;
}

describe("a call with arguments", () => {
  const text = 'Image("soundbox-front", caption: "Die Front")';

  it("is one component covering the whole line", () => {
    expect(nodesOf(text, NODE.Component)).toEqual([{ from: 0, to: text.length, text }]);
  });

  it("names itself", () => {
    expect(nodesOf(text, NODE.ComponentName)[0]?.text).toBe("Image");
  });

  it("keeps the value written first without a name", () => {
    const [first] = nodesOf(text, NODE.ComponentArgument);
    expect(first?.text).toBe('"soundbox-front"');
  });

  it("tells a string from a keyword from a number", () => {
    const written = 'HStack(spacing: 6, align: top, label: "six")';
    expect(nodesOf(written, NODE.ArgumentNumber)[0]?.text).toBe("6");
    expect(nodesOf(written, NODE.ArgumentKeyword)[0]?.text).toBe("top");
    expect(nodesOf(written, NODE.ArgumentString)[0]?.text).toBe('"six"');
  });
});

describe("a call with a body", () => {
  const text = "Note(tone: warning) {\n  Careful with that.\n}";

  it("holds its body as Markdown, at the positions in the document", () => {
    const [paragraph] = nodesOf(text, "Paragraph");
    expect(paragraph?.text).toBe("Careful with that.");
  });

  it("puts the body inside the component rather than beside it", () => {
    expect(shape(text)).toContain(NODE.ComponentBody);
    const [component] = nodesOf(text, NODE.Component);
    const [body] = nodesOf(text, NODE.ComponentBody);
    expect(component && body && body.from > component.from && body.to < component.to).toBe(true);
  });

  it("reads an indented body without turning it into a code block", () => {
    // Four spaces is a code block to Markdown, which is why the indentation of
    // the first line comes off before Markdown ever sees the body.
    const indented = "VStack {\n    A paragraph, indented four.\n}";
    expect(nodesOf(indented, "Paragraph")[0]?.text).toBe("A paragraph, indented four.");
    expect(nodesOf(indented, "CodeBlock")).toHaveLength(0);
  });

  it("finds a heading in a body", () => {
    const withHeading = "VStack {\n  ## Gehäuse\n\n  Zwei Hälften aus PETG.\n}";
    expect(nodesOf(withHeading, "ATXHeading2")[0]?.text).toBe("## Gehäuse");
  });
});

describe("a component inside a component", () => {
  const text = 'VStack {\n  HStack {\n    Image("a")\n  }\n}';

  it("finds all three", () => {
    const names = nodesOf(text, NODE.ComponentName).map((node) => node.text);
    expect(names).toEqual(["VStack", "HStack", "Image"]);
  });

  it("nests them", () => {
    const [outer, middle, inner] = nodesOf(text, NODE.Component);
    expect(outer && middle && inner).toBeTruthy();
    expect((outer?.from ?? 0) < (middle?.from ?? 0)).toBe(true);
    expect((middle?.to ?? 0) < (outer?.to ?? 0)).toBe(true);
    expect((inner?.from ?? 0) > (middle?.from ?? 0)).toBe(true);
  });

  it("gives the innermost one the position it actually has", () => {
    expect(nodesOf(text, NODE.Component)[2]?.text).toBe('Image("a")');
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

  it("parses into the five components it names", () => {
    expect(nodesOf(example, NODE.ComponentName).map((node) => node.text)).toEqual([
      "HStack",
      "Image",
      "VStack",
      "Spacer",
      "Button",
    ]);
  });

  it("keeps the heading and the paragraph inside the inner stack", () => {
    expect(nodesOf(example, "ATXHeading2")[0]?.text).toBe("## Gehäuse");
    expect(nodesOf(example, "Paragraph")[0]?.text).toBe(
      "Zwei Hälften aus PETG, die Lüfterschlitze sind gedruckt.",
    );
  });

  it("reads the button's four arguments", () => {
    const button = nodesOf(example, NODE.Component).find((node) => node.text.startsWith("Button"));
    expect(button?.text).toBe('Button("Modell ansehen", href: "#modell", icon: cube, tone: primary)');
  });

  it("covers the document from the first character to the last", () => {
    const [outer] = nodesOf(example, NODE.Component);
    expect(outer?.from).toBe(0);
    expect(outer?.to).toBe(example.length);
  });
});

describe("what is not a component", () => {
  it("a paragraph beginning with a capitalised word and a bracket", () => {
    // The failure case the issue names. `Image files (and models)` reads as a
    // component to anything matching only on the shape of the first word.
    const text = "Image files are large.\n";
    expect(nodesOf(text, NODE.Component)).toHaveLength(0);
    expect(nodesOf(text, "Paragraph")).toHaveLength(1);
  });

  it("a component line inside a fenced code block", () => {
    const text = '```markdown\nImage("a")\n```\n';
    expect(nodesOf(text, NODE.Component)).toHaveLength(0);
    expect(nodesOf(text, "FencedCode")).toHaveLength(1);
  });

  it("a line escaped with a backslash", () => {
    const text = '\\Image("a")\n';
    expect(nodesOf(text, NODE.Component)).toHaveLength(0);
  });

  it("a lower-case name", () => {
    expect(nodesOf('image("a")\n', NODE.Component)).toHaveLength(0);
  });
});

describe("a component that cannot be read", () => {
  it("is marked rather than swallowing the rest of the document", () => {
    const text = "VStack {\n  Some text.\n\nA paragraph that follows.\n";
    expect(nodesOf(text, NODE.ComponentError)).toHaveLength(1);
    expect(nodesOf(text, NODE.Component)).toHaveLength(0);
  });

  it("still names itself, so a message can say which one", () => {
    const text = "VStack {\n  Some text.\n";
    expect(nodesOf(text, NODE.ComponentName)[0]?.text).toBe("VStack");
  });

  it("leaves what comes before it parsed", () => {
    const text = "A paragraph first.\n\nVStack {\n  Then this.\n";
    expect(nodesOf(text, "Paragraph")[0]?.text).toBe("A paragraph first.");
    expect(nodesOf(text, NODE.ComponentError)).toHaveLength(1);
  });

  it("reports an unclosed bracket too", () => {
    const text = 'Image("a"\n';
    expect(nodesOf(text, NODE.ComponentError)).toHaveLength(1);
  });
});

describe("the same input", () => {
  it("produces the same tree every time", () => {
    // The acceptance says the browser and the server agree. They run this
    // module, so what there is to check is that it is a function of its input
    // and of nothing else.
    const text = 'VStack {\n  Image("a")\n  Note(tone: info) { x }\n}';
    expect(shape(text)).toBe(shape(text));
    expect(nodesOf(text, NODE.Component)).toEqual(nodesOf(text, NODE.Component));
  });
});
