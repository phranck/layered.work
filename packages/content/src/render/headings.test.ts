import { describe, expect, it } from "vitest";
import type { RenderNode } from "./model.js";
import { renderContent } from "./render.js";

function ids(nodes: RenderNode[]): string[] {
  return nodes.flatMap((node) =>
    node.kind === "element" || node.kind === "component"
      ? [
          ...(node.kind === "element" && node.attributes.id ? [node.attributes.id] : []),
          ...ids(node.children),
        ]
      : [],
  );
}
describe("heading anchors", () => {
  it.each([
    ["1.1 Fixpunkte setzen", "11-fixpunkte-setzen"],
    ["2.2 Start-Prompt Templates / Text Snippets", "22-start-prompt-templates--text-snippets"],
    ["Prerequisites", "prerequisites"],
    [
      "Schritt 3: Inhalt für die Autostart-Datei einfügen",
      "schritt-3-inhalt-für-die-autostart-datei-einfügen",
    ],
  ])("preserves the published Publii anchor for %s", (heading, id) => {
    expect(ids(renderContent(`## ${heading}`))).toEqual([id]);
  });
  it("uses rendered inline text and handles setext headings", () => {
    expect(ids(renderContent("**Build** &amp; `Test`\n====================\n"))).toEqual(["build--test"]);
  });
  it("disambiguates headings across nested components and resets for each document", () => {
    const source = "## Repeat\n\nVStack {\n ## Repeat\n}\n\n## Repeat-2\n\n## Repeat";
    expect(ids(renderContent(source))).toEqual(["repeat", "repeat-2", "repeat-2-2", "repeat-3"]);
    expect(ids(renderContent("## Repeat"))).toEqual(["repeat"]);
  });
});
