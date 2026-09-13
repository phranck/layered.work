import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * How the suite is run.
 *
 * Most of it touches no database at all. The tests that do are the ones where a
 * mock would be testing itself: a session whose row was deleted, an expiry that
 * has passed, a unique index refusing a second row. Those need an address, and
 * it is never the application's own.
 */

/** The project's own environment file, which is where the test address lives locally. */
const ENV_FILE = fileURLToPath(new URL("../../.env.local", import.meta.url));
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

/**
 * An address that resolves to nothing.
 *
 * `config.ts` refuses an environment with no `DATABASE_URL`, so one has to be
 * present for any module to import at all. When there is no test database this
 * is what it is, and every test that would touch one skips rather than waiting
 * for a connection to time out.
 */
const NOWHERE = "postgres://nobody@127.0.0.1:1/nothing";

/**
 * Where the suite writes.
 *
 * `DATABASE_URL_TEST` names a database of its own, declared in
 * `scripts/local-database/02-test-database.sql`, so a test can empty a table
 * without any care about what else is in there. It is assigned to
 * `DATABASE_URL` as well, because the application under test reads that one,
 * and leaving that pointing at the working database during a test run is
 * exactly how `data-safety.md` gets broken by accident.
 */
const TEST_DATABASE = process.env.DATABASE_URL_TEST ?? "";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/test-support/setup.ts"],
    // The database tests empty the tables between cases, so two files running
    // at once would clear each other's rows. They are few and fast.
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: TEST_DATABASE || NOWHERE,
      DATABASE_URL_TEST: TEST_DATABASE,
      SITE_ORIGIN: "http://localhost:3002",
      DASHBOARD_ORIGIN: "http://localhost:4502",
      LOG_LEVEL: "silent",
      // Fixed, so cookie signing is exercised with a key that is the same in
      // every test rather than one generated per process.
      SESSION_SECRET: "a-test-session-secret-that-is-long-enough",
    },
  },
});
