import { readFile } from "node:fs/promises";
import { getTableName, isTable } from "drizzle-orm";
import { connectOnce, databaseUrl } from "./connect.js";
import { MIGRATIONS } from "./migrate.js";
import * as schema from "./schema/index.js";

/**
 * Whether this container can actually serve, rather than whether something
 * answered.
 *
 * A TCP check proves a socket accepted. `select 1` proves a session opened.
 * Neither says anything about the three ways a container reaches the point of
 * answering requests and failing every one of them: the tables are not there,
 * the role cannot write to them, or the code is newer than the schema it was
 * built against. All three have the same symptom, which is that the service
 * looks healthy and returns errors.
 *
 * Asked by the platform's readiness check during a deployment, so a container
 * in any of those states never enters rotation. It is deliberately not the
 * liveness check: that one must not touch the database, because a dependency
 * that is briefly slow would then be reported as a dead process and take every
 * container down with it.
 */

/** What the runtime role has to be able to do with every table. */
const REQUIRED_PRIVILEGES = ["select", "insert", "update", "delete"] as const;

/** Where the schema lives. Checked as well, since a table privilege means nothing without it. */
const SCHEMA = "public";

/** One thing that has to hold, and what was found instead when it does not. */
type Check = { ok: boolean; detail: string };

/**
 * The first line of an error, which is as much as may leave the process.
 *
 * The driver puts the host, the port and the role it tried in the lines after
 * the first, and this answer is served to whoever asks for it.
 */
function firstLine(error: unknown): string {
  return String((error as Error).message).split("\n")[0] ?? "the database did not answer";
}

/** Everything asked, and the answer the endpoint reports. */
export type Readiness = {
  ready: boolean;
  checks: { tables: Check; privileges: Check; migrations: Check };
};

/**
 * The tables the code expects, read off the schema rather than listed here.
 *
 * A hand-written list is a second answer to a question the schema already
 * answers, and it drifts the first time a table is added without anybody
 * noticing, which is exactly when this check is supposed to speak up.
 */
export function expectedTables(): string[] {
  return Object.values(schema)
    .filter((exported) => isTable(exported))
    .map((table) => getTableName(table))
    .sort();
}

/** One table, one privilege, and whether the connected role holds it. */
type PrivilegeRow = { name: string; present: boolean; privilege: string; held: boolean | null };

/**
 * Asks whether each table is there and what the connected role may do with it.
 *
 * The privileges are asked of the database rather than assumed from the grants
 * that were written, because a grant that was written and a privilege that is
 * held are different things once a role, an owner or a revoke has intervened.
 *
 * Both lists go in as parameters and come back as rows, so adding a privilege
 * to `REQUIRED_PRIVILEGES` needs no second edit here. A column per privilege
 * would have been a copy of that list written in SQL.
 *
 * @param sql - An open connection.
 * @param names - The tables to ask about.
 */
async function readTables(sql: ReturnType<typeof connectOnce>, names: string[]): Promise<PrivilegeRow[]> {
  return sql<PrivilegeRow[]>`
    with found as (
      select name, to_regclass(${SCHEMA} || '.' || quote_ident(name)) as oid
        from unnest(${names}::text[]) as name
    ),
    wanted as (select unnest(${[...REQUIRED_PRIVILEGES]}::text[]) as privilege)
    select found.name,
           found.oid is not null as present,
           wanted.privilege,
           case
             when found.oid is null then null
             else has_table_privilege(found.oid, wanted.privilege)
           end as held
      from found cross join wanted
     order by found.name, wanted.privilege
  `;
}

/**
 * Turns those rows into the two checks the endpoint names separately.
 *
 * Separately, because a missing table and a missing grant are fixed by
 * different people doing different things, and a single "the database is wrong"
 * sends whoever reads it to look in both places.
 */
function judgeTables(rows: PrivilegeRow[], schemaUsable: boolean): [Check, Check] {
  const expected = new Set(rows.map((row) => row.name));
  const missing = [...new Set(rows.filter((row) => !row.present).map((row) => row.name))];
  const tables: Check = missing.length
    ? { ok: false, detail: `${missing.length} of ${expected.size} tables are absent: ${missing.join(", ")}` }
    : { ok: true, detail: `all ${expected.size} tables are present` };

  if (!schemaUsable) {
    return [tables, { ok: false, detail: `the role has no usage on the ${SCHEMA} schema` }];
  }

  const present = rows.filter((row) => row.present);
  if (present.length === 0) {
    return [tables, { ok: true, detail: "there is no table to check a privilege on" }];
  }

  const withoutRights = present
    .filter((row) => row.held !== true)
    .map((row) => `${row.privilege} on ${row.name}`);

  return [
    tables,
    withoutRights.length
      ? { ok: false, detail: `the role is missing ${withoutRights.join(", ")}` }
      : { ok: true, detail: `the role may ${REQUIRED_PRIVILEGES.join(", ")} on every table` },
  ];
}

/**
 * Asks the database about every expected table and turns the answer into the
 * two checks the endpoint names.
 *
 * @param sql - An open connection.
 * @returns The table check and the privilege check, in that order.
 */
async function readAndJudgeTables(sql: ReturnType<typeof connectOnce>): Promise<[Check, Check]> {
  const names = expectedTables();
  try {
    const [[usage], reports] = await Promise.all([
      sql<{ usable: boolean }[]>`select has_schema_privilege(${SCHEMA}, 'usage') as usable`,
      readTables(sql, names),
    ]);
    return judgeTables(reports, usage?.usable === true);
  } catch (error) {
    const detail = firstLine(error);
    return [
      { ok: false, detail },
      { ok: false, detail },
    ];
  }
}

/** One entry of the journal Drizzle writes beside the generated migrations. */
type JournalEntry = { idx: number; tag: string; when: number };

/**
 * Compares what the build shipped against what the database has applied.
 *
 * Drizzle records each applied migration with the journal's own `when` value,
 * so the newest of those is the tag that ran. A container whose code is ahead
 * of its schema answers every request and fails the ones that touch anything
 * new, which is the failure this catches before a single request arrives.
 *
 * @param sql - An open connection.
 */
async function checkMigrations(sql: ReturnType<typeof connectOnce>): Promise<Check> {
  let shipped: JournalEntry[];
  try {
    const journal = await readFile(new URL("meta/_journal.json", MIGRATIONS), "utf8");
    shipped = (JSON.parse(journal) as { entries: JournalEntry[] }).entries;
  } catch (error) {
    return { ok: false, detail: `the shipped journal could not be read: ${(error as Error).message}` };
  }

  const latest = shipped.at(-1);
  if (!latest) return { ok: true, detail: "this build ships no migrations" };

  try {
    const [applied] = await sql<{ count: number; newest: string | null }[]>`
      select count(*)::int as count, max(created_at)::text as newest
        from drizzle.__drizzle_migrations
    `;

    if (!applied || applied.newest === null) {
      return { ok: false, detail: `nothing is applied, and this build ships ${latest.tag}` };
    }
    if (Number(applied.newest) !== latest.when) {
      return {
        ok: false,
        detail: `${applied.count} migrations are applied, and this build ships ${shipped.length} up to ${latest.tag}`,
      };
    }
    return { ok: true, detail: `applied up to ${latest.tag}` };
  } catch (error) {
    // A database that has never been migrated has no such table, which is a
    // readable answer rather than an error and says exactly what is missing.
    return { ok: false, detail: `${firstLine(error)}, and this build ships ${latest.tag}` };
  }
}

/**
 * Answers the three questions, on one connection.
 *
 * A connection of its own each time rather than a pooled one, because a pooled
 * connection that was opened earlier proves that the credentials worked then.
 *
 * @returns What holds and what does not, with nothing in it that names a host,
 *   a user or a password.
 */
export async function checkReadiness(): Promise<Readiness> {
  const allThree = (detail: string): Readiness => ({
    ready: false,
    checks: {
      tables: { ok: false, detail },
      privileges: { ok: false, detail },
      migrations: { ok: false, detail },
    },
  });

  let sql: ReturnType<typeof connectOnce>;
  try {
    sql = connectOnce(databaseUrl());
  } catch (error) {
    return allThree((error as Error).message);
  }

  try {
    // Each answers on its own, because a database that has never been migrated
    // fails every one of them for a different reason, and reporting the first
    // of those three times hides the two that say what to do about it.
    const [tables, privileges] = await readAndJudgeTables(sql);
    const migrations = await checkMigrations(sql);

    return {
      ready: tables.ok && privileges.ok && migrations.ok,
      checks: { tables, privileges, migrations },
    };
  } catch (error) {
    return allThree(firstLine(error));
  } finally {
    await sql.end({ timeout: 2 });
  }
}
