import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { connectOnce, databaseUrl } from "./connect.js";

/**
 * Applies every migration that has not been applied, and refuses to do it as
 * the wrong role.
 *
 * The check comes before the first statement rather than after the first
 * failure, because by then the wrong thing has already happened. Both sibling
 * projects carry the same guard and both had a reason: a superuser bypasses
 * every grant and every ownership check, so a migration that should have been
 * refused instead succeeds, quietly, against tables it does not own.
 */

/** Where the generated migrations live, relative to this file rather than to wherever it is run from. */
const MIGRATIONS = fileURLToPath(new URL("../../drizzle/", import.meta.url));

/**
 * The role the migration is expected to run as.
 *
 * Named in the environment because it differs between here and Zerops, which
 * creates its own. Unset means the name is not checked and only the privilege
 * is, which is the half of this that holds everywhere.
 */
const EXPECTED_ROLE = "DATABASE_EXPECTED_ROLE";

/** What the database says about the session before anything is written. */
type Session = { role: string; isSuperuser: boolean };

/**
 * Refuses to go on when the session is more privileged than the work requires.
 *
 * @param session - Who the connection turned out to be.
 * @throws When the role is a superuser, or when a name is expected and differs.
 */
export function refuseWrongRole(session: Session): void {
  const expected = process.env[EXPECTED_ROLE];

  if (session.isSuperuser) {
    throw new Error(
      `Refusing to migrate as "${session.role}", which is a superuser. A superuser bypasses every grant and every ownership check, so a migration that should fail would instead succeed against tables it does not own.${
        expected ? ` Connect as "${expected}" instead.` : ""
      }`,
    );
  }

  if (expected && session.role !== expected) {
    throw new Error(
      `Refusing to migrate as "${session.role}". ${EXPECTED_ROLE} names "${expected}", and a migration run as anything else leaves the schema owned by whoever happened to be connected.`,
    );
  }
}

/** Asks the database who it thinks is connected. */
async function whoAmI(sql: ReturnType<typeof connectOnce>): Promise<Session> {
  const [row] = await sql<{ role: string; is_superuser: boolean }[]>`
    select current_user as role, rolsuper as is_superuser
    from pg_roles where rolname = current_user
  `;
  if (!row) throw new Error("The database did not say which role is connected.");
  return { role: row.role, isSuperuser: row.is_superuser };
}

/**
 * Runs the migrations, having checked who is running them.
 *
 * @returns The role it ran as, so the caller can say so.
 */
export async function runMigrations(): Promise<string> {
  const sql = connectOnce(databaseUrl());
  try {
    const session = await whoAmI(sql);
    refuseWrongRole(session);
    await migrate(drizzle(sql), { migrationsFolder: MIGRATIONS });
    return session.role;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Run when this file is the command rather than an import, which is how the
// package script and the platform's init command both reach it.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  try {
    const role = await runMigrations();
    process.stdout.write(`migrations applied as ${role}\n`);
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
  }
}
