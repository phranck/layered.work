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
  "index",
] as const;

function stableCssTokens(source: Buffer): string {
  return source
    .toString("utf8")
    .replaceAll(/\s+/g, " ")
    .replaceAll(/\s*([{}:;,>+~])\s*/g, "$1")
    .trim();
}

describe("prototype style parity", () => {
  it.each(styleNames.map((name) => [name]))("keeps %s.css rules unchanged", (name) => {
    const packageCss = readFileSync(fileURLToPath(new URL(`./${name}.css`, import.meta.url)));
    const prototypeCss = readFileSync(
      fileURLToPath(new URL(`../../../prototype/ui/${name}.css`, import.meta.url)),
    );
    expect(stableCssTokens(packageCss)).toBe(stableCssTokens(prototypeCss));
  });
});
