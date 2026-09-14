import { defineConfig } from "vitest/config";

/**
 * The register has no side effects and reaches nothing, so the suite needs
 * nothing set up. It runs against the real register rather than a fixture,
 * because what is worth checking is that the register everything else reads is
 * readable.
 */
export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
