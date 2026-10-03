/** Repeatable local-only pipeline. No database writes, uploads or network calls. */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareMedia } from "./media.mjs";
import { validateExport } from "./validate.mjs";

const args = process.argv.slice(2);
function argument(name, fallback) {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
}
const root = fileURLToPath(new URL("../../", import.meta.url));
const output = resolve(argument("--output", resolve(root, "migration-out")));
const media = resolve(argument("--media-output", resolve(root, "apps/website/public/media")));
const pythonArgs = args.filter((arg) => arg !== "--strict");
const exported = spawnSync(
  "python3",
  [fileURLToPath(new URL("./migrate.py", import.meta.url)), ...pythonArgs],
  { stdio: "inherit" },
);
if (exported.status !== 0) process.exit(exported.status ?? 1);
try {
  console.log(JSON.stringify(await prepareMedia(output, media)));
  console.log(JSON.stringify(await validateExport(output, { strict: args.includes("--strict") })));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
