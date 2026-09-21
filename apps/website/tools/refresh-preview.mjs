/** Render the preview and put it in place of the one that is being looked at.
 *
 * `render-preview.mjs` refuses an existing destination, which is right: it must
 * never write into a directory it did not create. Refreshing therefore means
 * rendering beside the live one and swapping, and doing that by hand is where it
 * goes wrong. A run that fails between the two moves leaves no preview at all,
 * and one that keeps its backup leaves 170MB behind every time.
 *
 * WEBSITE_CONTENT_FILE=/absolute/site.json node tools/refresh-preview.mjs [--target /absolute/website-preview]
 */
import { spawnSync } from "node:child_process";
import { mkdtemp, rename, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    target: { type: "string" },
    "legacy-output": { type: "string" },
  },
});
const defaultTarget = fileURLToPath(new URL("../../../../design-proposals/website-preview", import.meta.url));
const target = resolve(values.target ?? defaultTarget);
const parent = dirname(target);
const name = basename(target);
const previous = join(parent, `.${name}-previous`);

/** Renders into a directory the renderer creates itself, and returns its report line. */
function render(destination) {
  const renderer = fileURLToPath(new URL("./render-preview.mjs", import.meta.url));
  const args = [renderer, "--out", destination];
  if (values["legacy-output"]) args.push("--legacy-output", values["legacy-output"]);
  const result = spawnSync(process.execPath, args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr.trim() || "The preview renderer failed");
  process.stderr.write(result.stderr);
  return result.stdout.trim();
}

const staging = await mkdtemp(join(parent, `.${name}-next.`));
await rm(staging, { recursive: true, force: true });
try {
  const report = render(staging);
  await rm(previous, { recursive: true, force: true });
  await rename(target, previous).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
  await rename(staging, target);
  await rm(previous, { recursive: true, force: true });
  // The renderer reports where it wrote, which was the staging directory. What
  // the reader wants is where the preview now answers.
  console.log(report.replace(JSON.stringify(staging), JSON.stringify(target)));
} catch (error) {
  await rm(staging, { recursive: true, force: true });
  // A target still in place needs nothing; one already moved comes back, so a
  // failed refresh never leaves the reader without a preview.
  await rename(previous, target).catch(() => {});
  console.error(error.message);
  process.exitCode = 1;
}
