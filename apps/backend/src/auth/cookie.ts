import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { isProduction } from "../config.js";

/**
 * The session cookie's attributes, decided once.
 *
 * Written here rather than at each call so that setting it and clearing it
 * cannot disagree. A cookie cleared with different attributes from the ones it
 * was set with is not cleared: the browser keeps the original and the person
 * stays signed in after pressing sign out.
 */

/** What it is called. The `__Host-` prefix is added below where it can be honoured. */
const NAME = "layered_session";

/**
 * The prefixed name, which a browser enforces on our behalf.
 *
 * `__Host-` makes the browser refuse the cookie unless it is `Secure`, has no
 * `Domain`, and has `Path=/`. That turns three things we would otherwise only
 * write down into three things a browser checks, and in particular it means no
 * other host under `layered.work` can set a cookie that this one would read.
 *
 * Only over HTTPS, so it cannot be used against `http://localhost`, which is
 * why the name depends on the environment.
 */
export const SESSION_COOKIE = isProduction ? `__Host-${NAME}` : NAME;

/**
 * How long the browser keeps it, in seconds.
 *
 * Matches the expiry stored on the row. The row is what actually decides,
 * because the cookie's own expiry is a request the browser stops making rather
 * than a rule anybody enforces.
 */
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * Puts the session cookie on the response.
 *
 * `sameSite: "Lax"` because the dashboard and the API are different hosts under
 * the same registrable domain, which makes a request between them same-site and
 * the cookie is sent. `Strict` would work for that too and would additionally
 * withhold the cookie when somebody arrives from a link in an email, so they
 * would see themselves signed out and then signed in a moment later.
 *
 * @param c - The request being answered.
 * @param value - What `openSession` returned.
 */
export function setSessionCookie(c: Context, value: string): void {
  setCookie(c, SESSION_COOKIE, value, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "Lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

/** Reads it, or undefined. */
export function getSessionCookie(c: Context): string | undefined {
  return getCookie(c, SESSION_COOKIE);
}

/**
 * Clears it, with the attributes it was set with.
 *
 * The row is deleted separately and that is what ends the session. This only
 * stops the browser sending a value that no longer works.
 */
export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "Lax",
    path: "/",
  });
}
