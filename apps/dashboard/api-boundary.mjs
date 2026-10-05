import { isBuiltin } from "node:module";

const DATABASE_PACKAGES = [
  "postgres",
  "pg",
  "drizzle-orm",
  "@prisma/client",
  "mongodb",
  "mysql",
  "mysql2",
  "sqlite3",
  "better-sqlite3",
  "knex",
  "sequelize",
  "kysely",
  "sql.js",
  "@libsql/client",
  "@neondatabase/serverless",
  "@layered/backend",
];

/** Enforces the browser/API boundary over the resolved graph and emitted bundle. */
export function dashboardApiBoundary() {
  return {
    name: "layered-dashboard-api-boundary",
    enforce: "pre",
    resolveId(source, importer) {
      if (
        importer &&
        (isBuiltin(source) ||
          DATABASE_PACKAGES.some((name) => source === name || source.startsWith(`${name}/`)))
      ) {
        this.error(`Dashboard API boundary: database or server import ${source}.`);
      }
      return null;
    },
    moduleParsed(module) {
      const id = module.id.replaceAll("\\", "/");
      if (
        id.includes("/apps/backend/") ||
        DATABASE_PACKAGES.some((name) => id.includes(`/node_modules/${name}/`))
      ) {
        this.error("Dashboard API boundary: database or server import in the resolved module graph.");
      }
    },
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        const text =
          output.type === "chunk" ? output.code : typeof output.source === "string" ? output.source : "";
        if (/postgres(?:ql)?:\/\//i.test(text)) {
          this.error(`Dashboard API boundary: database connection string in ${output.fileName}.`);
        }
      }
    },
  };
}
