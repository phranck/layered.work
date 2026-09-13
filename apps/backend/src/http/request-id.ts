import { randomUUID } from "node:crypto";
import { createMiddleware } from "hono/factory";

/**
 * The identifier that ties a response somebody is holding to the one log line
 * that explains it.
 *
 * **Generated here, never read from the request.** An inbound `X-Request-Id`
 * is a value the caller chose: it can repeat, so two failures share an id and
 * neither can be found, and it can be anything, so it reaches the log as
 * whatever somebody put in it. A tracing system that wants to correlate across
 * services sends its own header and this one stays ours.
 *
 * A uuid v4 carries 122 random bits, so the chance of two colliding across
 * every request this site will ever serve is not a number worth writing down.
 */

/** What the identifier is called on the response. */
export const REQUEST_ID_HEADER = "X-Request-Id";

/**
 * Every context in this application carries it.
 *
 * Declared globally rather than as a generic on each router, because the
 * middleware below runs on every request and a helper several calls deep should
 * not have to be handed a type parameter to read a value that is always there.
 */
declare module "hono" {
  interface ContextVariableMap {
    requestId: string;
  }
}

/** Puts an identifier on every request, and on the response so it can be quoted. */
export const requestId = createMiddleware(async (c, next) => {
  const id = randomUUID();
  c.set("requestId", id);
  c.header(REQUEST_ID_HEADER, id);
  await next();
});
