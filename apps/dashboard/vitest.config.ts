import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { conditions: ["development"] },
  define: { __API_BASE__: JSON.stringify("/api") },
  test: { environment: "happy-dom", include: ["src/**/*.test.{ts,tsx}"] },
});
