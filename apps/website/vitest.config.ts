import { defineConfig } from "vitest/config";

/**
 * Only the application's own tests run here.
 *
 * `tools/preview-assets.test.mjs` is written for the Node test runner, which
 * vitest cannot read, so collecting it fails the run. The package's `test`
 * script runs that file with its own runner instead.
 */
export default defineConfig({
  test: { include: ["src/**/*.test.{ts,tsx}"] },
});
