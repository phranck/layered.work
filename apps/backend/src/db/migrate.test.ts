import { afterEach, describe, expect, it } from "vitest";
import { refuseWrongRole } from "./migrate.js";

const previous = process.env.DB_MIGRATION_ROLE;
afterEach(() => {
  if (previous === undefined) delete process.env.DB_MIGRATION_ROLE;
  else process.env.DB_MIGRATION_ROLE = previous;
});

describe("migration role guard", () => {
  it("refuses a missing expected role before a migration", () => {
    delete process.env.DB_MIGRATION_ROLE;
    expect(() => refuseWrongRole({ role: "layered_app", isSuperuser: false })).toThrow("DB_MIGRATION_ROLE");
  });

  it("refuses a mismatch and a superuser", () => {
    process.env.DB_MIGRATION_ROLE = "layered_app";
    expect(() => refuseWrongRole({ role: "other", isSuperuser: false })).toThrow();
    expect(() => refuseWrongRole({ role: "layered_app", isSuperuser: true })).toThrow();
  });

  it("allows the explicitly configured non-superuser role", () => {
    process.env.DB_MIGRATION_ROLE = "layered_app";
    expect(() => refuseWrongRole({ role: "layered_app", isSuperuser: false })).not.toThrow();
  });
});
