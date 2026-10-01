import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * The production build's Astro App, loaded in this process so its routes can be
 * rendered without opening a network listener.
 *
 * Astro 7's standalone adapter bundles the App and the manifest into
 * `entry.mjs` but exports only its Node handler. This exposes that existing App
 * in an isolated copy of the file, so its routes, renderer and middleware are
 * byte for byte the production build. `render-preview.mjs` and
 * `verify-migration.mjs` both render through it.
 *
 * @param serverDirectory - `dist/server` of a completed build.
 * @returns The App instance the production server would use.
 */
export async function loadProductionApp(serverDirectory) {
  const productionEntry = await readFile(join(serverDirectory, "entry.mjs"), "utf8");
  assert(
    /\b(?:var|const|let) app = createApp\(/.test(productionEntry),
    "Unsupported Astro adapter bundle: expected its production App instance",
  );
  assert(
    productionEntry.includes('process.env.ASTRO_NODE_AUTOSTART !== "disabled"'),
    "Unsupported Astro adapter: no explicit autostart switch",
  );
  process.env.ASTRO_NODE_AUTOSTART = "disabled";
  process.env.ASTRO_NODE_LOGGING = "disabled";

  const temporaryEntry = join(serverDirectory, `.preview-${randomUUID()}.mjs`);
  try {
    await writeFile(temporaryEntry, `${productionEntry}\nexport { app as previewApp };\n`, { flag: "wx" });
    const { previewApp } = await import(pathToFileURL(temporaryEntry).href);
    return previewApp;
  } finally {
    await rm(temporaryEntry, { force: true });
  }
}
