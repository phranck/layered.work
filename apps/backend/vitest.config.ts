import { defineConfig } from "vitest/config";

/**
 * The suite runs against the real modules, with no database.
 *
 * `DATABASE_URL` and the two origins are set here because `config.ts` is read
 * at import time and refuses an unusable environment, which is the behaviour
 * being relied on rather than worked around. Nothing in these tests connects:
 * the address is a shape, not a destination.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgres://nobody@127.0.0.1:1/nothing",
      SITE_ORIGIN: "http://localhost:3002",
      DASHBOARD_ORIGIN: "http://localhost:4502",
      LOG_LEVEL: "silent",
    },
  },
});
