import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { drizzle } from "drizzle-orm/postgres-js";
import { writePublicSnapshot } from "../content/snapshot.js";
import { connectOnce, databaseUrl } from "./connect.js";
import { holdsEntries } from "./import-content.js";

/**
 * Writes what the site reads from a database into the committed fallback,
 * `apps/website/content/site.json`.
 *
 * The site reads that file when the backend does not answer, and `db:import`
 * rebuilds a database from it, so it has to say what the database says. It is
 * written from a database holding the published content, such as a backup of
 * production restored as `docs/hosting.md` describes, and never by hand.
 *
 * ```sh
 * DATABASE_URL=postgres://… pnpm --filter @layered/backend db:snapshot
 * pnpm --filter @layered/backend db:snapshot /tmp/site.json
 * ```
 *
 * A database holding no entries is refused, because its snapshot would leave
 * the site nothing to fall back to.
 */

const DEFAULT_OUTPUT = "../../../website/content/site.json";

const { positionals } = parseArgs({ allowPositionals: true });
const file = resolve(positionals[0] ?? fileURLToPath(new URL(DEFAULT_OUTPUT, import.meta.url)));

const sql = connectOnce(databaseUrl());
try {
  const database = drizzle(sql);
  if (await holdsEntries(database)) {
    await writePublicSnapshot(database, file);
    console.log(`Wrote the published content to ${file}.`);
  } else {
    process.stderr.write("The database holds no entries, so the snapshot was left as it is.\n");
    process.exitCode = 1;
  }
} finally {
  await sql.end({ timeout: 5 });
}
