import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { drizzle } from "drizzle-orm/postgres-js";
import { connectOnce, databaseUrl } from "./connect.js";
import { importVariants, type Snapshot } from "./import-content.js";
import { mediaRoots } from "./media-roots.js";
import { requireLocalMediaDatabase } from "./sync-media-env.js";

/**
 * Backfills variants in the local library without changing entries or originals.
 * The files are found where `db:import` finds them.
 *
 * pnpm --filter @layered/backend db:import-variants --variant-root /path/to/website/public
 */
const { values } = parseArgs({
  options: { snapshot: { type: "string" }, "variant-root": { type: "string" } },
});
const url = databaseUrl();
requireLocalMediaDatabase(url);
const snapshotPath = resolve(
  values.snapshot ?? fileURLToPath(new URL("../../../website/content/site.json", import.meta.url)),
);
const snapshot = JSON.parse(await readFile(snapshotPath, "utf8")) as Snapshot;
const sql = connectOnce(url);
try {
  const variants = await importVariants(drizzle(sql), snapshot, mediaRoots(values["variant-root"]));
  console.log(`Imported ${variants} measured responsive variants.`);
} finally {
  await sql.end({ timeout: 5 });
}
