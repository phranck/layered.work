/**
 * The database, as one module.
 *
 * Drizzle reads everything exported from here, and so does the migration
 * generator, so a table that is not re-exported is a table that does not exist
 * as far as either is concerned.
 */
export * from "./entries.js";
export * from "./enums.js";
