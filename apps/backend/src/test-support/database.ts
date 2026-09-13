import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { expectedTables } from "../db/readiness.js";
import * as schema from "../db/schema/index.js";

/**
 * A real database for the suite, because the things worth testing here are the
 * ones a mock cannot have.
 *
 * A session that was deleted, an expiry that has passed, a unique index that
 * refuses a second row: every one of those is the database's behaviour rather
 * than the application's, and a test against a mock of it tests the mock.
 *
 * **It is a separate database, not a separate schema in the shared one.**
 * `data-safety.md` forbids a test touching data it did not create, and two
 * databases makes that a property of the address rather than a rule every test
 * has to remember. `scripts/local-database/02-test-database.sql` declares it,
 * so `docker compose up -d` on a fresh volume produces it, and the deploy has
 * no idea it exists.
 */

/** Where the suite's database is, which is never where the application's is. */
const TEST_DATABASE_URL = "DATABASE_URL_TEST";

/** Where the generated migrations live, relative to this file. */
const MIGRATIONS = fileURLToPath(new URL("../../drizzle/", import.meta.url));

/** The one connection the suite shares, opened when the first test asks. */
let connection: ReturnType<typeof postgres> | undefined;

/**
 * Whether the suite can reach a database at all.
 *
 * Tests that need one skip rather than fail when it is absent, so somebody
 * running the suite without Docker gets the rest of it instead of a wall of
 * connection errors. CI has one, so nothing is skipped where it counts.
 */
export const hasTestDatabase = Boolean(process.env[TEST_DATABASE_URL]);

/**
 * Opens it and brings the schema up to date, once per process.
 *
 * @returns The database the suite writes to.
 */
export async function testDatabase(): Promise<PostgresJsDatabase<typeof schema>> {
  const url = process.env[TEST_DATABASE_URL];
  if (!url) {
    throw new Error(
      `${TEST_DATABASE_URL} is not set. It is in .env.example, and the database it names comes up with \`docker compose up -d\`.`,
    );
  }

  connection ??= postgres(url, { max: 4, idle_timeout: 5, connect_timeout: 10, onnotice: () => {} });
  const database = drizzle(connection, { schema });

  // Cheap after the first time: the migrator reads what has been applied and
  // does nothing. Here rather than in a global setup file so that a suite run
  // against a database that was dropped still works.
  await migrate(database, { migrationsFolder: MIGRATIONS });
  return database;
}

/**
 * Empties every table the application owns.
 *
 * The list comes from the schema, through the same function the readiness check
 * uses, so a table added later is cleared without anybody remembering. A
 * hand-written list here would leave one table full of the previous test's rows
 * the first time somebody forgot, and the failure would land in whichever test
 * ran next.
 *
 * `TRUNCATE ... CASCADE` rather than a delete per table, because the order
 * would otherwise have to be maintained by hand for the same reason.
 */
export async function emptyTestDatabase(): Promise<void> {
  const database = await testDatabase();
  const tables = expectedTables()
    .map((name) => `"${name}"`)
    .join(", ");
  await database.execute(sql.raw(`truncate table ${tables} restart identity cascade`));
}

/** Closes it, for the end of a run. */
export async function closeTestDatabase(): Promise<void> {
  await connection?.end({ timeout: 5 });
  connection = undefined;
}
