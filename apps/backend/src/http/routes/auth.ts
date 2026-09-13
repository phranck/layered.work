import { ErrorCode, type SignedInAs, signInBody } from "@layered/schemas";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { clearSessionCookie, getSessionCookie, setSessionCookie } from "../../auth/cookie.js";
import { NO_SUCH_ACCOUNT, verifyPassword } from "../../auth/password.js";
import { closeSession, openSession, type Principal } from "../../auth/session.js";
import { database } from "../../db/connect.js";
import { users } from "../../db/schema/index.js";
import { logger } from "../../logger.js";
import { withSession } from "../require-session.js";
import { HttpError, ok } from "../response.js";
import { validate } from "../validate.js";

/**
 * Signing in, signing out, and asking who is signed in.
 *
 * **Wrong password and unknown address are the same answer.** The same status,
 * the same body, and the same amount of work, because scrypt at this cost takes
 * long enough to measure across a network and an early return on "no such
 * account" would therefore answer "does this address have an account here" to
 * anybody with a stopwatch. Whether an address is registered is not this API's
 * to disclose.
 */
export const auth = new Hono();

/** What both failures say. Written once so the two cannot drift apart. */
const REFUSED = "That email address and password do not match.";

/** How the principal is shown to the browser. */
function asSignedIn(principal: Principal): SignedInAs {
  return {
    id: principal.userId,
    email: principal.email,
    displayName: principal.displayName,
    role: principal.role,
  };
}

auth.post("/sign-in", validate("json", signInBody), async (c) => {
  const { email, password } = c.req.valid("json");
  const db = database();

  // Lower-cased on the way in, because the column is written lower-cased and
  // two spellings of one address must not be two accounts nor one miss.
  const [account] = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);

  const correct = await verifyPassword(password, account?.passwordHash ?? NO_SUCH_ACCOUNT);

  if (!account || !correct) {
    // At info: a wrong password is somebody mistyping far more often than it is
    // an attack, and the serious kind must not be buried under it. The address
    // is not logged, because a log of addresses that tried to sign in is a list
    // of this site's accounts, near enough.
    logger.info(
      { requestId: c.get("requestId"), code: ErrorCode.Unauthenticated, route: c.req.routePath },
      account ? "sign-in refused: wrong password" : "sign-in refused: no such account",
    );
    throw new HttpError(ErrorCode.Unauthenticated, REFUSED);
  }

  const { cookieValue } = await openSession(db, account.id, c.req.header("user-agent") ?? null);
  setSessionCookie(c, cookieValue);

  logger.info({ requestId: c.get("requestId"), userId: account.id, route: c.req.routePath }, "signed in");

  return ok(c, {
    id: account.id,
    email: account.email,
    displayName: account.displayName,
    role: account.role,
  } satisfies SignedInAs);
});

/**
 * Ends this session.
 *
 * Answers the same whether or not there was one to end. Telling a caller that
 * their cookie was already invalid is a way of testing cookies.
 */
auth.post("/sign-out", async (c) => {
  const ended = await closeSession(database(), getSessionCookie(c));
  clearSessionCookie(c);

  if (ended) {
    logger.info({ requestId: c.get("requestId"), route: c.req.routePath }, "signed out");
  }
  return ok(c, { signedOut: true });
});

/**
 * Who is signed in, or nobody.
 *
 * Deliberately not behind `requireSession`: the dashboard asks this on load to
 * find out whether to show the sign-in screen, and a 401 for the ordinary case
 * of not being signed in yet is an error that is not an error.
 */
auth.get("/me", withSession, (c) => {
  const principal = c.get("principal");
  return ok(c, principal ? asSignedIn(principal) : null);
});
