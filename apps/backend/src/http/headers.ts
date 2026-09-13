import { API_POLICY, NO_FRAMING, SHARED_HEADERS } from "@layered/policy";
import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import { config } from "../config.js";

/**
 * What leaves this service on every response, and who is allowed to ask.
 *
 * **The allowed origins come from configuration, never from the request.** An
 * `Origin` header is whatever the caller chose to send, so reflecting it back
 * with credentials permitted is the same as allowing everybody, written in a
 * way that looks careful.
 */

/**
 * The two interfaces, and nothing else.
 *
 * Read once at start-up. Both are required variables, so an environment that
 * cannot produce this list stops the boot rather than producing an empty one,
 * which would refuse every browser and look like a broken deployment.
 */
export const ALLOWED_ORIGINS: readonly string[] = [config.SITE_ORIGIN, config.DASHBOARD_ORIGIN];

/**
 * Cross-origin rules for the two interfaces.
 *
 * `credentials: true` because the dashboard sends the session cookie, and that
 * is exactly why the list is explicit: a wildcard and credentials cannot be
 * combined, and the arrangement that tempts somebody into reflecting the
 * request's own origin instead is the one this avoids.
 *
 * Hono's own middleware writes `Vary: Origin`, which matters more than it
 * looks: without it a cache can hand one caller the answer computed for
 * another, including the header that said who was allowed.
 */
export const corsForInterfaces = cors({
  origin: (origin) => (ALLOWED_ORIGINS.includes(origin) ? origin : null),
  credentials: true,
  allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type"],
  maxAge: 600,
});

/**
 * The headers every response carries, whatever route produced it.
 *
 * Set after the handler rather than before, so a route cannot forget and
 * cannot override by writing its own response object.
 */
export const safetyHeaders = createMiddleware(async (c, next) => {
  await next();
  for (const [name, value] of Object.entries({ ...SHARED_HEADERS, ...NO_FRAMING })) {
    c.header(name, value);
  }
  c.header("Content-Security-Policy", API_POLICY);
});
