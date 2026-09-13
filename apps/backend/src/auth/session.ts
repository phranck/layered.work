import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { sessionSecret } from "../config.js";
import { sessions, users } from "../db/schema/index.js";
import { deviation } from "../logger.js";

/**
 * What a signed-in browser holds, and how a request is traced back to a person.
 *
 * **The cookie is a random value; the table holds its hash.** Somebody who
 * reads the whole sessions table learns nothing they can present, which is the
 * difference between a leak and a break-in.
 *
 * **How large the value is.** 32 bytes from the system's random source, written
 * as 43 base64url characters, which is 2^256 distinct values. Guessing one that
 * exists takes 2^255 attempts on average, and with the few thousand sessions
 * this site will ever hold the chance that any two collide is about
 * (10^4)^2 / 2^257. Neither bound is the thing to worry about, which is why the
 * signature below exists for a different reason entirely.
 */

/** 32 bytes, which is 256 bits and 43 base64url characters. */
const TOKEN_BYTES = 32;

/** How long a session lasts without being used at all. */
const LIFETIME_DAYS = 30;

/** What a request turned out to be, once the cookie was believed. */
export type Principal = {
  userId: string;
  sessionId: string;
  email: string;
  displayName: string;
  role: "owner" | "editor";
};

/** The database this module is given, rather than one it opens. */
type Database = PostgresJsDatabase<Record<string, unknown>>;

/**
 * Signs a token, so that a value that was never issued here is refused without
 * a database query.
 *
 * The token is already unguessable, so this is not what stops somebody
 * presenting a forged one. What it stops is the cost of finding out: every
 * authenticated request carries a cookie, and without a signature each piece of
 * rubbish sent as one costs an indexed query. With it, the same rubbish costs
 * one HMAC and never reaches the database.
 *
 * It also gives a way to end every session at once, by changing the secret,
 * without writing to the database at all.
 */
function sign(token: string): string {
  return createHmac("sha256", sessionSecret).update(token).digest("base64url");
}

/** SHA-256, hex. Fast on purpose: a 256-bit random value has nothing to guess. */
function fingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Splits a cookie value into the token and the signature it came with.
 *
 * @returns The token when the signature is this server's, and null otherwise.
 */
export function readCookieValue(value: string): string | null {
  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;

  const token = value.slice(0, separator);
  const claimed = Buffer.from(value.slice(separator + 1), "base64url");
  const expected = Buffer.from(sign(token), "base64url");

  if (claimed.length !== expected.length) return null;
  return timingSafeEqual(claimed, expected) ? token : null;
}

/**
 * Starts a session for somebody who has just proved who they are.
 *
 * @param database - An open connection.
 * @param userId - Who is signing in.
 * @param userAgent - What the browser called itself, kept so a list of sessions
 *   is readable by the person deciding which to end.
 * @returns The cookie value, which is the only time the token exists outside
 *   the browser holding it.
 */
export async function openSession(
  database: Database,
  userId: string,
  userAgent: string | null,
): Promise<{ cookieValue: string; expiresAt: Date }> {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(Date.now() + LIFETIME_DAYS * 24 * 60 * 60 * 1000);

  await database.insert(sessions).values({
    userId,
    tokenHash: fingerprint(token),
    expiresAt,
    userAgent,
  });

  return { cookieValue: `${token}.${sign(token)}`, expiresAt };
}

/**
 * Works out who is making this request, if anybody.
 *
 * Expiry is part of the query rather than a check afterwards, so a session past
 * its date is simply not found. Checking after the fact is where a "renew it
 * while we are here" eventually gets written, and a session that renews itself
 * never expires.
 *
 * @param database - An open connection.
 * @param cookieValue - Whatever arrived in the cookie.
 * @returns Who it is, or null.
 */
export async function readSession(
  database: Database,
  cookieValue: string | undefined,
): Promise<Principal | null> {
  if (!cookieValue) return null;

  const token = readCookieValue(cookieValue);
  if (!token) return null;

  const [row] = await database
    .select({
      sessionId: sessions.id,
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, fingerprint(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (!row) return null;

  // Moved forward so a list of sessions says which are in use, and so an idle
  // timeout has something to read. Not awaited, because it is a convenience and
  // a request should not wait for it, and caught, because an unhandled
  // rejection from a floating promise ends the process in Node.
  database
    .update(sessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(sessions.id, row.sessionId))
    .catch((error: unknown) => deviation("could not record that a session was used", { error }));

  return row;
}

/**
 * Ends a session.
 *
 * The row goes, rather than the cookie being cleared and the row left behind:
 * a cleared cookie is a request the browser stops making, and the token would
 * still work for anybody who copied it.
 *
 * @param database - An open connection.
 * @param cookieValue - Whatever arrived in the cookie.
 * @returns Whether a session was actually ended.
 */
export async function closeSession(database: Database, cookieValue: string | undefined): Promise<boolean> {
  if (!cookieValue) return false;

  const token = readCookieValue(cookieValue);
  if (!token) return false;

  const removed = await database
    .delete(sessions)
    .where(eq(sessions.tokenHash, fingerprint(token)))
    .returning({ id: sessions.id });

  return removed.length > 0;
}
