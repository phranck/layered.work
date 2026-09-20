import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { dashboardApiOrigin } from "./config.mjs";

export default defineConfig(({ command }) => ({
  root: fileURLToPath(new URL("./", import.meta.url)),
  plugins: [react()],
  publicDir: fileURLToPath(new URL("./assets/", import.meta.resolve("@layered/ui/copy-assets"))),
  define: { __API_BASE__: JSON.stringify("/api") },
  build: { copyPublicDir: false },
  server: {
    host: "localhost",
    port: Number(process.env.PORT ?? 4502),
    proxy: {
      "/api": {
        target: dashboardApiOrigin(command),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api(?=\/|$)/, ""),
      },
    },
  },
}));
