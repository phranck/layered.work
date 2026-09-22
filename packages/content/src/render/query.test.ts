import { describe, expect, it } from "vitest";
import { rendersComponent } from "./query.js";
import { renderContent } from "./render.js";

describe("what a document contains", () => {
  it("finds a component that stands on its own", () => {
    expect(rendersComponent(renderContent('Model("cube", alt: "A cube")\n'), "Model")).toBe(true);
  });

  it("finds one nested inside another component", () => {
    const nodes = renderContent('Note(tone: warning) {\n  Model("cube", alt: "A cube")\n}\n');
    expect(rendersComponent(nodes, "Model")).toBe(true);
  });

  it("says no when the document is prose", () => {
    expect(rendersComponent(renderContent("Nothing but a sentence.\n"), "Model")).toBe(false);
  });

  it("says no when the word only appears as text", () => {
    // The question is what draws something, never what the prose mentions. A
    // page that writes about models must not be given a model's permissions.
    expect(rendersComponent(renderContent("This post is about a Model.\n"), "Model")).toBe(false);
  });
});
