import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const styleNames = [
  "logo",
  "button",
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

describe("prototype style parity", () => {
  it("retains every prototype component import in its original order", () => {
    const imports = (source: string) =>
      [...source.matchAll(/@import url\("(.+?)"\)/g)].map((match) => match[1]);
    const readCss = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
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
