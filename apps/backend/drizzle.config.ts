import { defineConfig } from "drizzle-kit";

/**
 * How migrations are generated.
 *
 * Generating reads the schema files and the journal in `drizzle/` and needs no
 * database at all. Applying them is the runner's job, not this tool's, because
 * the runner checks which role it is connected as before it writes anything.
 *
 * `data-safety.md` governs what follows from that: a migration is never written
 * or edited by hand, and when the tool blocks on drift the work stops and the
 * finding is reported rather than worked around.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  casing: "snake_case",
  strict: true,
  verbose: true,
  dbCredentials: {
    // Whatever is in the environment, and nothing if it is empty. A missing
    // address is an error rather than a reason to reach for a hosted database,
    // which `data-safety.md` states and which has cost a sibling project a
    // confusing afternoon.
    url: process.env.DATABASE_URL ?? "",
  },
});
