// @ts-check
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import node from "@astrojs/node";
import react from "@astrojs/react";
import { defineConfig } from "astro/config";
import { localMedia } from "./tools/local-media.mjs";

/**
 * The project's local environment file, which says where the site's content
 * comes from (`API_URL`, `WEBSITE_CONTENT_FILE`).
 *
 * Astro does not read a file at the repository's root, and the pages read
 * `process.env` at request time, so without this the development server has no
 * content source and answers every page with 503. The backend loads the same
 * file through `--env-file-if-exists` in its scripts. A variable the
 * environment already sets wins, so the `PORT` grat starts this with stays, and
 * a deployment, which has no such file, is untouched.
 */
const ENV_FILE = fileURLToPath(new URL("../../.env.local", import.meta.url));
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

/**
 * Puts React inside the built server, and only there.
 *
 * Zerops deploys `dist` without the app's pnpm dependency links, so the React
 * server renderer has to travel inside the standalone output, which
 * `ssr.noExternal` does. The development server must not get the same line:
 * there Vite's module runner would load React's CommonJS entry itself, which has
 * no `module`, and the server stops with "module is not defined". Locally React
 * is in `node_modules`, so Node resolves it as it resolves everything else.
 *
 * @returns An integration that adds the line for `astro build` alone.
 */
export function bundleReactIntoBuild() {
  return {
    name: "layered:bundle-react-into-build",
    hooks: {
      /** @param {{ command: string, updateConfig: (config: object) => unknown }} options */
      "astro:config:setup": ({ command, updateConfig }) => {
        if (command !== "build") return;
        updateConfig({ vite: { ssr: { noExternal: ["react", "react-dom", "@phosphor-icons/react"] } } });
      },
    },
  };
}

/**
 * Server-rendered, on Node.
 *
 * Not static, because the page served at any address depends on the clock: the
 * countdown answers until the launch and the site answers after it, decided per
 * request in src/middleware.ts. A build made in advance cannot hold both.
 *
 * `standalone` gives a server that listens by itself, which is what the run
 * command in zerops.yml starts. The alternative expects something else to hand
 * it requests, and there is nothing else here.
 */
export default defineConfig({
  site: "https://layered.work",
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [react(), bundleReactIntoBuild()],
  vite: {
    // Local work's media answer at their storage keys, from the directory the
    // backend keeps them in, which is what the bucket does in a deployment.
    plugins: [
      localMedia(
        process.env.MEDIA_LOCAL_DIR
          ? fileURLToPath(new URL(`../../${process.env.MEDIA_LOCAL_DIR}/`, import.meta.url))
          : undefined,
      ),
    ],
    // The model viewer is imported only once a model scrolls into view, so the
    // development server would discover it then, re-bundle its dependencies,
    // and answer the page's request for the old bundle with 504. Bundling it
    // at start-up means there is nothing left to discover.
    optimizeDeps: { include: ["@google/model-viewer"] },
  },
  build: {
    // Kept out of the way of public/, which holds the wordmark, the typefaces
    // and the sharing image, and which zerops.yml deploys as its own directory.
    assets: "_assets",
  },
  server: {
    host: true,
    // Note for anyone testing the switch locally: the development server
    // refuses a request whose Host header it does not recognise, so asking it
    // as `layered.work` answers 403 rather than the countdown. That is Vite
    // guarding against DNS rebinding and it is worth keeping. Set
    // WEBSITE_MODE=countdown to see the countdown instead. The built server has
    // no such check, and the host rule works there.
    // The port Zerops sends requests to, declared in zerops.yml beside the
    // service. It is set here because the start command there is handed to
    // `exec` rather than to a shell, so it cannot carry an assignment, and
    // because Zerops holds the key `PORT` itself and refuses the file when it
    // appears among the environment variables. Astro's own default is 4321,
    // which answers nothing that anybody asks for.
    //
    // The environment wins where it says anything, which is how the same
    // configuration serves both ends. Locally grat starts this with PORT set,
    // because 3000 belongs to lmaa.space on that machine; in production nothing
    // sets it and the number below is what is used. Checked both ways: a built
    // server with 3000 compiled in and PORT=3311 in its environment listens on
    // 3311.
    port: Number(process.env.PORT ?? 3000),
  },
});
