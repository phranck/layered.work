import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function readCss(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
}

describe("article content styles", () => {
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
