import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { drizzle } from "drizzle-orm/postgres-js";
import { connectOnce, databaseUrl } from "./connect.js";
import { holdsEntries, importContent, type Snapshot, withDrafts } from "./import-content.js";

/**
 * Puts a content snapshot into an empty database.
 *
 * Reads the file rather than the Publii database, which #97 already read and
 * which nothing here touches again. The default is the snapshot this repository
 * publishes. That file holds no drafts, so `--drafts-from` names the migration
 * output, and the drafts are taken from there and nothing else is.
 *
 * A database that already holds entries is refused. It is what the site
 * publishes, and the snapshot would overwrite every text written in the
 * dashboard since.
 *
 * ```sh
 * pnpm --filter @layered/backend db:import
 * pnpm --filter @layered/backend db:import --drafts-from ../../migration-out/site.json
 * pnpm --filter @layered/backend db:import --variant-root /path/to/website/public
 * ```
 *
 * The default variant root is this checkout's website/public directory. The
 * staged migration images must be present there or supplied with the option.
 */

const DEFAULT_SNAPSHOT = "../../../website/content/site.json";

/** What the command says when the database already holds content. */
const REFUSAL = [
  "The database already holds entries, so nothing was imported.",
  "It is what the site publishes, and an import would overwrite the text written in the dashboard.",
  "Import into an empty database only, such as one `pnpm db:reset` has just rebuilt.",
].join("\n");

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { "drafts-from": { type: "string" }, "variant-root": { type: "string" } },
});

/** Reads and parses one snapshot file. */
async function readSnapshot(path: string): Promise<Snapshot> {
  return JSON.parse(await readFile(resolve(path), "utf8")) as Snapshot;
}

const file = resolve(positionals[0] ?? fileURLToPath(new URL(DEFAULT_SNAPSHOT, import.meta.url)));
const published = await readSnapshot(file);
const draftsFrom = values["drafts-from"];
const snapshot = draftsFrom ? withDrafts(published, await readSnapshot(draftsFrom)) : published;
const variantRoot = resolve(
  values["variant-root"] ?? fileURLToPath(new URL("../../../website/public/", import.meta.url)),
);

const sql = connectOnce(databaseUrl());
try {
  const database = drizzle(sql);
  if (await holdsEntries(database)) {
    process.stderr.write(`${REFUSAL}\n`);
    process.exitCode = 1;
  } else {
    const report = await importContent(database, snapshot, { variantRoot });
    console.log(JSON.stringify({ file, draftsFrom: draftsFrom ?? null, ...report }, null, 2));
  }
} finally {
  await sql.end({ timeout: 5 });
}
