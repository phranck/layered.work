import { ErrorCode } from "@layered/schemas";
import { createMiddleware } from "hono/factory";
import { getSessionCookie } from "../auth/cookie.js";
import { type Principal, readSession } from "../auth/session.js";
import { database } from "../db/connect.js";
import { HttpError } from "./response.js";

/**
 * Who is making this request, and refusing the ones that are nobody.
 *
 * **A route is authenticated because a line says so.** There is no rule that
 * makes everything private by default with exceptions listed somewhere else:
 * an exception list is read once, when it is written, and a route added
 * afterwards is public because nobody remembered to add it. Here the middleware
 * is on the route, in the same file as the handler, where it is read every time
 * the handler is.
 */

/**
 * Every context may carry a principal. Present when a session was believed.
 */
declare module "hono" {
  interface ContextVariableMap {
    principal?: Principal;
  }
}

/**
 * Reads the session if there is one, and lets the request through either way.
 *
 * For routes that answer differently to a signed-in person without requiring
 * one, and for the route that reports whether anybody is signed in at all.
 */
export const withSession = createMiddleware(async (c, next) => {
  const principal = await readSession(database(), getSessionCookie(c));
  if (principal) c.set("principal", principal);
  await next();
});

/** Refuses the request when nobody is signed in. */
export const requireSession = createMiddleware(async (c, next) => {
  const principal = await readSession(database(), getSessionCookie(c));
  if (!principal) {
    throw new HttpError(ErrorCode.Unauthenticated, "You are not signed in.");
  }
  c.set("principal", principal);
  await next();
});

/**
 * The principal, for a handler that runs behind `requireSession`.
 *
 * Throws rather than returning undefined, because a handler reaching this
 * without the middleware in front of it is a wiring mistake, and the safe
 * failure for a wiring mistake is a refusal rather than a request that
 * continues with nobody attached.
 *
 * @param c - The request.
 */
export function principalOf(c: { get: (key: "principal") => Principal | undefined }): Principal {
  const principal = c.get("principal");
  if (!principal) {
    throw new HttpError(
      ErrorCode.Unauthenticated,
      "You are not signed in.",
      new Error("principalOf was called on a route with no requireSession in front of it"),
    );
  }
  return principal;
}
