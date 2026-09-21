import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { dashboardApiOrigin } from "./config.mjs";

/**
 * The name the seeded local account signs in under, paired with its address.
 *
 * The seed writes one account from `SEED_NAME` and `SEED_EMAIL`, so a local
 * session means typing an address that only ever stands for that one account.
 * The login screen accepts the name instead when this pair is compiled in, and
 * sends the address it maps to, which leaves the server's authentication
 * untouched.
 *
 * Only a development server reads the variables. A production build compiles
 * `null`, so no address and no alias reaches the shipped bundle.
 */
function localLoginAlias(command) {
  if (command !== "serve") return null;
  const environment = loadEnv("", fileURLToPath(new URL("../../", import.meta.url)), "");
  const username = environment.SEED_NAME?.trim();
  const email = environment.SEED_EMAIL?.trim().toLowerCase();
  return username && email ? { username, email } : null;
}

export default defineConfig(({ command }) => ({
  root: fileURLToPath(new URL("./", import.meta.url)),
  plugins: [react()],
  publicDir: fileURLToPath(new URL("./assets/", import.meta.resolve("@layered/ui/copy-assets"))),
  define: {
    __API_BASE__: JSON.stringify("/api"),
    __LOGIN_ALIAS__: JSON.stringify(localLoginAlias(command)),
  },
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
