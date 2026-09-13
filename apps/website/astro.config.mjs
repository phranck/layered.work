// @ts-check
import node from "@astrojs/node";
import { defineConfig } from "astro/config";

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
  build: {
    // Kept out of the way of public/, which holds the wordmark, the typefaces
    // and the sharing image, and which zerops.yml deploys as its own directory.
    assets: "_assets",
  },
  server: {
    host: true,
    // The port Zerops sends requests to, declared in zerops.yml beside the
    // service. It is set here because the start command there is handed to
    // `exec` rather than to a shell, so it cannot carry an assignment, and
    // because Zerops holds the key `PORT` itself and refuses the file when it
    // appears among the environment variables. Astro's own default is 4321,
    // which answers nothing that anybody asks for.
    port: 3000,
  },
});
