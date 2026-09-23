import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { connectOnce, databaseUrl } from "./connect.js";
import { importContent, type Snapshot } from "./import-content.js";

/**
 * Puts a content snapshot into the database it is pointed at.
 *
 * Reads the file rather than the Publii database, which #97 already read and
 * which nothing here touches again. The default is the snapshot this repository
 * publishes; pass a path to import one that still carries the drafts.
 *
 * ```sh
 * pnpm --filter @layered/backend db:import
 * pnpm --filter @layered/backend db:import ../../migration-out/site.json
 * ```
 */

const DEFAULT_SNAPSHOT = "../../../website/content/site.json";

const file = resolve(process.argv[2] ?? fileURLToPath(new URL(DEFAULT_SNAPSHOT, import.meta.url)));
const snapshot = JSON.parse(await readFile(file, "utf8")) as Snapshot;

const sql = connectOnce(databaseUrl());
try {
  const report = await importContent(drizzle(sql), snapshot);
  console.log(JSON.stringify({ file, ...report }, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
