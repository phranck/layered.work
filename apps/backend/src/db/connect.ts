import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

/**
 * Opening a connection, with the one rule that has cost a sibling project a
 * confusing afternoon: a missing address is an error.
 *
 * `data-safety.md` states it plainly. Falling back to a hosted database when
 * the local one is not configured means reading somebody's real data whilst
 * believing you are looking at your own, and every answer that comes back is
 * about the wrong place. An empty table then reads as "this record does not
 * exist" rather than as "you are looking in the wrong database".
 */

/** What the address is called, so the name is written once. */
export const DATABASE_URL = "DATABASE_URL";

/**
 * Reads the address, or refuses.
 *
 * @returns The connection string.
 * @throws When the variable is absent or empty, naming what to set rather than
 *   what went wrong.
 */
export function databaseUrl(): string {
  const url = process.env[DATABASE_URL];
  if (!url) {
    throw new Error(
      `${DATABASE_URL} is not set. Locally it comes from .env.local, which .env.example is the template for, and the database it names comes up with \`docker compose up -d\`.`,
    );
  }
  return url;
}

/**
 * A connection for a task that runs once and stops.
 *
 * One socket, short timeouts, and no pool, because the migration runner and the
 * seed each open it, do their work and end. The server's own connection is not
 * this one and has its own lifetime.
 *
 * @param url - The address to open, defaulting to what the environment names.
 */
export function connectOnce(url: string = databaseUrl()) {
  return postgres(url, { max: 1, idle_timeout: 5, connect_timeout: 10, onnotice: () => {} });
}

/**
 * How many connections the service holds open.
 *
 * One container, one author, and a database that counts its connections as a
 * resource. Ten is far more than this site will use at once and far less than
 * anything a plan limits, so the number is here to be a number rather than a
 * default somebody has to go and look up.
 */
const POOL_SIZE = 10;

/** The pool, opened when it is first wanted rather than when this module loads. */
let pool: ReturnType<typeof postgres> | undefined;

/**
 * The connection the server uses for requests.
 *
 * Lazily opened, because importing this module must not open a socket: the
 * suite imports the schema and the helpers around it without ever touching a
 * database, and a connection attempted at import time would make every one of
 * those tests wait for a timeout.
 */
export function database() {
  pool ??= postgres(databaseUrl(), {
    max: POOL_SIZE,
    idle_timeout: 30,
    connect_timeout: 10,
    onnotice: () => {},
  });
  return drizzle(pool, { schema });
}

/**
 * Closes the pool, for a process that is shutting down.
 *
 * @param timeoutSeconds - How long to let a query in flight finish.
 */
export async function closeDatabase(timeoutSeconds = 5): Promise<void> {
  await pool?.end({ timeout: timeoutSeconds });
  pool = undefined;
}
