import { readFileSync } from "node:fs";

export const root = new URL("../", import.meta.url);

export function backendDeployFiles() {
  const setup = readFileSync(new URL("zerops.yml", root), "utf8")
    .split("  - setup: backend\n")[1]
    .split("  - setup: website\n")[0];
  return setup
    .split("      deployFiles:\n")[1]
    .split("      cache:")[0]
    .match(/^ {8}- (.+)$/gm)
    .map((line) => line.trim().slice(2));
}
