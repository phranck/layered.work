import { COMPONENT_NAMES, components, parseContent, validateContent } from "@layered/content";
import { describe, expect, it } from "vitest";
import { COMPONENT_GROUPS, componentSnippet } from "./editor-toolbar.js";

/** The components that stand on their own; a part arrives with its whole. */
const STANDALONE = COMPONENT_NAMES.filter((name) => !("within" in components[name]));

describe("the components the toolbar offers", () => {
  it("are every component in the register that stands on its own, each once", () => {
    const offered = COMPONENT_GROUPS.flat();
    expect([...offered].sort()).toEqual([...STANDALONE].sort());
    expect(new Set(offered).size).toBe(offered.length);
  });

  it("insert a table whose column and row already fit each other", () => {
    const snippet = componentSnippet("Table");
    expect(snippet).toBe('Table {\n  TableColumn("", value: name)\n  TableRow(name: "")\n}');
    expect(validateContent(snippet).findings).toEqual([]);
  });

  it("are inserted as components the parser reads, with their required values left empty", () => {
    for (const name of COMPONENT_NAMES) {
      const names: string[] = [];
      let broken = false;
      parseContent(componentSnippet(name)).iterate({
        enter(node) {
          if (node.name === "ComponentError") broken = true;
          if (node.name === "ComponentName") names.push(node.name);
        },
      });
      expect(broken, name).toBe(false);
      expect(names.length, name).toBeGreaterThan(0);
    }
  });

  it("insert a picture, a note and a divider in the shape an author would write them", () => {
    expect(componentSnippet("Image")).toBe('Image("")');
    expect(componentSnippet("Button")).toBe('Button("", href: "")');
    expect(componentSnippet("Note")).toBe("Note {\n  \n}");
    expect(componentSnippet("Divider")).toBe("Divider()");
    expect(componentSnippet("Spacer")).toBe("Spacer()");
  });
});
