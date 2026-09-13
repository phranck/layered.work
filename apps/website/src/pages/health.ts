import type { APIRoute } from "astro";

/**
 * Whether this process is up and answering.
 *
 * Zerops asks for this before it sends any traffic to a new container, so a
 * deployment that fails to start is one that never replaces the running one.
 * Without it a broken start takes the site down instead.
 *
 * Liveness, not readiness: it says the server is answering and nothing more. It
 * deliberately touches no database and reaches nothing over the network, so a
 * dependency being slow can never be mistaken for this process being dead.
 *
 * It answers whilst the site is still held back as well, which
 * `src/middleware.ts` has to allow by name. A health check that the middleware
 * refuses would keep every container out of service until the launch.
 */
export const GET: APIRoute = () =>
  new Response("ok\n", {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
