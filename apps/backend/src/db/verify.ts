import { writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { drizzle } from "drizzle-orm/postgres-js";
import { readPublicSnapshot } from "../content/snapshot.js";
import { connectOnce, databaseUrl } from "./connect.js";
import { compare, readSource, readTarget, type Verification } from "./verify-migration.js";
import { missingObjects } from "./verify-storage.js";

/**
 * Compares the Publii site with the database it is pointed at, and prints the
 * result as Markdown tables: the counts, every post, and every file absent from
 * the database. `docs/content-and-addresses.md` records them. It also asks the
 * store for every storage key the library holds, and lists any that names no
 * object.
 *
 * ```sh
 * pnpm --filter @layered/backend db:verify
 * pnpm --filter @layered/backend db:verify --snapshot-out /tmp/database-snapshot.json
 * ```
 *
 * `--snapshot-out` also writes what the site would read from this database, so
 * the website's own check can render exactly that. The process exits non-zero
 * when anything differs, so it can stand in a script.
 */

const DEFAULT_INPUT = join(homedir(), "Documents/Publii/sites/layeredwork/input");

const { values } = parseArgs({
  options: {
    publii: { type: "string", default: DEFAULT_INPUT },
    "snapshot-out": { type: "string" },
  },
});

/** A table cell for a yes-or-no comparison. */
function mark(value: boolean): string {
  return value ? "yes" : "**no**";
}

/** The result as Markdown, the form it is recorded in. */
function render(verification: Verification): string {
  const counts = [
    "| What | Publii | Database | Matches | Note |",
    "| --- | ---: | ---: | --- | --- |",
    ...verification.counts.map(
      (row) => `| ${row.what} | ${row.source} | ${row.target} | ${mark(row.matches)} | ${row.note} |`,
    ),
  ];
  const entries = [
    "| Slug | Address | State | Title | Date | Topics | Problems |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...verification.entries.map(
      (row) =>
        `| \`${row.slug}\` | ${row.path ? `\`${row.path}\`` : "none"} | ${row.state} | ${mark(row.title)} | ${mark(row.date)} | ${mark(row.topics)} | ${row.problems.join("; ")} |`,
    ),
  ];
  const absent = [
    "| File | Named by a post |",
    "| --- | --- |",
    // Publii's size copies are counted in the table above and left out of this
    // list, which would otherwise be a hundred lines of the same pictures.
    ...verification.absentFiles
      .filter((file) => !file.copy)
      .map((file) => `| \`${file.path}\` | ${file.named ? "**yes**" : "no"} |`),
  ];
  return [...counts, "", ...entries, "", ...absent, ""].join("\n");
}

const source = readSource(resolve(values.publii));
const sql = connectOnce(databaseUrl());
try {
  const database = drizzle(sql);
  const verification = compare(source, await readTarget(database));
  console.log(render(verification));

  // Every key the library holds has to name an object in the store this
  // process reads, which is the bucket where one is configured and the local
  // directory otherwise.
  const missing = await missingObjects(database);
  console.log(
    missing.length === 0
      ? "Every storage key names an object in the store."
      : [
          "| File | Storage key with no object |",
          "| --- | --- |",
          ...missing.map((file) => `| \`${file.slug}\` | \`${file.storageKey}\` |`),
          "",
        ].join("\n"),
  );

  const out = values["snapshot-out"];
  if (out) await writeFile(resolve(out), `${JSON.stringify(await readPublicSnapshot(database), null, 2)}\n`);

  const passed = verification.passed && missing.length === 0;
  console.log(passed ? "Nothing differs." : "Differences found.");
  process.exitCode = passed ? 0 : 1;
} finally {
  await sql.end({ timeout: 5 });
}
