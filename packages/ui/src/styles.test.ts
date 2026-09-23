import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const styleNames = [
  "logo",
  // Issue #169 supersedes the prototype button sizes and icon-font layout.
  "shortcut",
  "field",
  "row",
  "section",
  "card",
  "choice",
  "editor",
  "sidebar",
] as const;

function stableCssTokens(source: Buffer): string {
  return source
    .toString("utf8")
    .replaceAll(/\s+/g, " ")
    .replaceAll(/\s*([{}:;,>+~])\s*/g, "$1")
    .trim();
}

function readCss(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
}

describe("prototype style parity", () => {
  it("retains every prototype component import in its original order", () => {
    const imports = (source: string) =>
      [...source.matchAll(/@import url\("(.+?)"\)/g)].map((match) => match[1]);
    const original = imports(readCss("../../../prototype/ui/index.css"));
    const current = imports(readCss("./index.css"));
    expect(current.filter((name) => original.includes(name))).toEqual(original);
  });
  it.each(styleNames.map((name) => [name]))("keeps %s.css rules unchanged", (name) => {
    const packageCss = readFileSync(fileURLToPath(new URL(`./${name}.css`, import.meta.url)));
    const prototypeCss = readFileSync(
      fileURLToPath(new URL(`../../../prototype/ui/${name}.css`, import.meta.url)),
    );
    expect(stableCssTokens(packageCss)).toBe(stableCssTokens(prototypeCss));
  });
});

describe("article content styles", () => {
  it("uses the larger content type step", () => {
    const source = readCss("./content-renderer.css");
    expect(source).toMatch(/\.content-prose\s*\{[^}]*font-size:\s*var\(--text-lg\)/s);
  });

  it("presents tables as a rounded card with header and row feedback", () => {
    const source = readCss("./content-renderer.css");
    expect(source).toMatch(/\.content-table\s*\{[^}]*border-radius:[^}]*overflow-x:\s*auto/s);
    expect(source).toMatch(/\.content-table thead\s*\{[^}]*background:\s*var\(--surface-raised\)/s);
    expect(source).toMatch(/\.content-table tbody tr:hover\s*\{[^}]*background:\s*var\(--hover-tint\)/s);
  });

  it("reads a column heading whole and still breaks a cell anywhere", () => {
    const source = readCss("./content-renderer.css");
    expect(source).toMatch(/\.content-table th\s*\{[^}]*white-space:\s*nowrap/s);
    expect(source).toMatch(/\.content-table th\s*\{[^}]*overflow-wrap:\s*normal/s);
    expect(source).toMatch(/\.content-table :where\(th, td\)\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  });
});
