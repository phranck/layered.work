import { defaultKeymap } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, runScopeHandlers } from "@codemirror/view";
import { parseContent } from "@layered/content";
import { afterEach, describe, expect, it } from "vitest";
import { contentLanguage } from "./content-editor.js";
import { contentIndentation, reindentDocument } from "./content-indent.js";

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
});

/** A surface with the language and the indentation, and the keys Enter is bound by. */
function surface(doc = "", cursor = doc.length): EditorView {
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: [contentLanguage(), contentIndentation(), keymap.of(defaultKeymap)],
    }),
  });
  views.push(view);
  return view;
}

/** Enter, through the keymap, so the Markdown binding gets its turn before the default. */
function pressEnter(view: EditorView) {
  runScopeHandlers(view, new KeyboardEvent("keydown", { key: "Enter" }), "editor");
}

/** Types text one character at a time, the way the browser hands it to the surface. */
function type(view: EditorView, text: string) {
  for (const character of text) {
    if (character === "\n") {
      pressEnter(view);
      continue;
    }
    const { from, to } = view.state.selection.main;
    const insert = () =>
      view.state.update(view.state.replaceSelection(character), { userEvent: "input.type" });
    const handled = view.state
      .facet(EditorView.inputHandler)
      .some((handler) => handler(view, from, to, character, insert));
    if (!handled) view.dispatch(insert());
  }
}

/** What reindenting a document makes of it. */
function reindented(doc: string): string {
  const view = surface(doc);
  reindentDocument(view);
  return view.state.doc.toString();
}

/** The example of the content language's epic, laid out as it is when it is right. */
const EXAMPLE = `HStack(spacing: 6, align: top) {
  Image("soundbox-front", caption: "Die Front")
  VStack {
    ## Gehäuse

    Zwei Hälften aus PETG, die Lüfterschlitze sind gedruckt.

    Spacer()
    Button("Modell ansehen", href: "#modell", icon: cube, tone: primary)
  }
}

Model("next-soundbox", alt: "NeXT SoundBox mini")

Note(tone: warning) { Das Image braucht eine Karte mit mindestens 16 GB. }`;

/**
 * The same example with every line standing wherever it happened to be put. The
 * first line of a body sets its margin and the others stand up to three columns
 * from it, because four or more would make them code.
 */
const MANGLED = `HStack(spacing: 6, align: top) {
      Image("soundbox-front", caption: "Die Front")
   VStack {
          ## Gehäuse

          Zwei Hälften aus PETG, die Lüfterschlitze sind gedruckt.

     Spacer()
            Button("Modell ansehen", href: "#modell", icon: cube, tone: primary)
 }
    }

  Model("next-soundbox", alt: "NeXT SoundBox mini")

  Note(tone: warning) { Das Image braucht eine Karte mit mindestens 16 GB. }`;

describe("reindenting a document", () => {
  it("derives every line from the structure, whatever state it was in", () => {
    expect(reindented(MANGLED)).toBe(EXAMPLE);
  });

  it("changes nothing the second time, and nothing in a document that is already right", () => {
    expect(reindented(reindented(MANGLED))).toBe(reindented(MANGLED));
    expect(reindented(EXAMPLE)).toBe(EXAMPLE);
  });

  it("keeps a nested list at the distance it has from the first line of its body", () => {
    const mangled = "VStack {\n        - one\n          - nested\n        - two\n }";
    expect(reindented(mangled)).toBe("VStack {\n  - one\n    - nested\n  - two\n}");
  });

  it("does not change what the parser reads", () => {
    const mangled = "VStack {\n        - one\n          - nested\n        - two\n }";
    expect(parseContent(reindented(mangled)).toString()).toBe(parseContent(mangled).toString());
    expect(parseContent(reindented(MANGLED)).toString()).toBe(parseContent(MANGLED).toString());
  });

  it("leaves a line the parser reads as code where it is", () => {
    const doc = 'VStack {\n  Image("a")\n          Spacer()\n}';
    expect(reindented(doc)).toBe(doc);
  });

  it("leaves Markdown at the top of the document as it is written", () => {
    const prose = "Some text\n\n- item\n  - nested\n\n    code-like paragraph\n";
    expect(reindented(prose)).toBe(prose);
  });

  it("hangs a multi-line argument list one level below its component", () => {
    const mangled = 'VStack {\nButton(\n"x",\n        href: "y"\n)\n}';
    expect(reindented(mangled)).toBe('VStack {\n  Button(\n    "x",\n    href: "y"\n  )\n}');
  });
});

describe("typing", () => {
  it("lays out the epic's example with no manual indentation", () => {
    const view = surface();
    type(
      view,
      EXAMPLE.split("\n")
        .map((line) => line.trimStart())
        .join("\n"),
    );
    expect(view.state.doc.toString()).toBe(EXAMPLE);
  });

  it("opens a line between two braces, at the level of the body", () => {
    const text = "HStack {\n  VStack {}\n}";
    const view = surface(text, "HStack {\n  VStack {".length);
    pressEnter(view);
    expect(view.state.doc.toString()).toBe("HStack {\n  VStack {\n    \n  }\n}");
    expect(view.state.selection.main.head).toBe("HStack {\n  VStack {\n    ".length);
  });

  it("indents a new line inside a body to the body's level", () => {
    const text = 'HStack {\n  Image("a")\n}';
    const view = surface(text, 'HStack {\n  Image("a")'.length);
    pressEnter(view);
    expect(view.state.doc.toString()).toBe('HStack {\n  Image("a")\n  \n}');
  });

  it("opens a line between two brackets, hanging below the component", () => {
    const view = surface("Button()", "Button(".length);
    pressEnter(view);
    expect(view.state.doc.toString()).toBe("Button(\n  \n)");
  });

  it("outdents a closing brace as it is typed", () => {
    const view = surface("VStack {\n  Spacer()\n  ");
    type(view, "}");
    expect(view.state.doc.toString()).toBe("VStack {\n  Spacer()\n}");
  });

  it("closes a bracket the language uses, and types over the closer instead of doubling it", () => {
    const view = surface();
    type(view, "Button(");
    expect(view.state.doc.toString()).toBe("Button()");
    type(view, ")");
    expect(view.state.doc.toString()).toBe("Button()");
    expect(view.state.selection.main.head).toBe("Button()".length);
  });

  it("marks the bracket that pairs with the one beside the cursor, and one with no partner", () => {
    const paired = surface('Button("x")');
    paired.dispatch({ selection: { anchor: "Button(".length } });
    const marked = [...paired.contentDOM.querySelectorAll(".cm-matchingBracket")];
    expect(marked.map((element) => element.textContent)).toEqual(["(", ")"]);

    const lone = surface('Button("x"');
    lone.dispatch({ selection: { anchor: "Button(".length } });
    expect(lone.contentDOM.querySelector(".cm-nonmatchingBracket")?.textContent).toBe("(");
  });

  it("closes nothing in prose", () => {
    const view = surface();
    type(view, `don't "quote" [it]`);
    expect(view.state.doc.toString()).toBe(`don't "quote" [it]`);
  });
});
