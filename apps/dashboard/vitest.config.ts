import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { conditions: ["development"] },
  define: { __API_ORIGIN__: JSON.stringify("http://localhost:4002") },
  test: { environment: "happy-dom", include: ["src/**/*.test.{ts,tsx}"] },
});
