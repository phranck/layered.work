// @ts-check
import node from "@astrojs/node";
import react from "@astrojs/react";
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
  integrations: [react()],
  vite: {
    // Zerops deploys dist without the app's pnpm dependency links. Keep the
    // React server renderer inside that standalone output.
    ssr: { noExternal: ["react", "react-dom"] },
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
