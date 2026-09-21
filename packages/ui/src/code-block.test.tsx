import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CodeBlock } from "./code-block.js";

function draw(source: string, language?: string) {
  const template = document.createElement("template");
  template.innerHTML = renderToStaticMarkup(<CodeBlock source={source} language={language} />);
  return template.content;
}

describe("code block highlighting", () => {
  it.each([
    ["bash", 'echo "$HOME" # home'],
    ["shell", 'echo "$HOME" # home'],
    ["sh", 'echo "$HOME" # home'],
    ["swift", 'let name = "World" // greeting'],
    ["ini", "[section]\nenabled=true\n; comment"],
    ["mermaid", "graph TD\n A[Start] --> B[End]"],
    ["html", '<div class="example">Hi</div>'],
    ["js", 'const name = "World"; // greeting'],
    ["ts", "const count: number = 1;"],
    ["json", '{"enabled": true}'],
    ["css", ".example { color: red; }"],
    ["python", 'def greet():\n    return "Hello"'],
  ])("renders %s syntax colors in the initial HTML", (language, source) => {
    const code = draw(source, language).querySelector("code");
    expect(code?.textContent).toBe(source);
    const colors = new Set(Array.from(code?.querySelectorAll("span") ?? [], (span) => span.style.color));
    expect(colors.size).toBeGreaterThan(1);
  });

  it.each([
    ["swift", "swift"],
    ["bash", "gnubash"],
    ["sh", "gnubash"],
    ["shell", "gnubash"],
    ["zsh", "gnubash"],
    ["html", "html5"],
  ])("marks a %s block with its own brand", (language, brand) => {
    const toolbar = draw("x", language).querySelector(".content-code__toolbar");
    const mark = toolbar?.querySelector(".content-code__mark");
    expect(mark?.getAttribute("data-brand")).toBe(brand);
    expect(mark?.classList.contains("brand-mark")).toBe(true);
    expect(toolbar?.textContent).toContain(language);
  });

  it.each([
    "text",
    "ini",
    undefined,
  ])("falls back to the neutral mark where %s has no brand of its own", (language) => {
    const mark = draw("x", language).querySelector(".content-code__mark");
    expect(mark).not.toBeNull();
    expect(mark?.classList.contains("brand-mark")).toBe(false);
    expect(mark?.tagName.toLowerCase()).toBe("svg");
  });

  it("preserves exact whitespace and escapes HTML while coloring tokens", () => {
    const source = '\tconst sample = "<script>alert(1)</script>";\r\n\r\n  sample();\r\n';
    const block = draw(source, "js");
    expect(block.querySelector("code")?.textContent).toBe(source);
    expect(block.querySelector("script")).toBeNull();
    expect(block.querySelector(".content-code__gutter")?.textContent).toBe("1\n2\n3");
  });

  it.each([
    undefined,
    "text",
    "plaintext",
    "unknown-language",
  ])("keeps %s source intact without inventing a programming language", (language) => {
    const source = "Instructions:\n  Keep the original text.\n";
    expect(draw(source, language).querySelector("code")?.textContent).toBe(source);
  });
});
