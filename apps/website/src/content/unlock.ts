import { createHmac, timingSafeEqual } from "node:crypto";
import { verifyPassword } from "@layered/passwords";
import { callerAddress } from "@layered/policy";

/**
 * The gate in front of a protected entry.
 *
 * A protected entry asks for a password before it renders anything, and the
 * answer is remembered for that entry alone. Both halves of that sentence are
 * here: what makes an answer acceptable, and what carries it back.
 *
 * **The cookie is scoped to the entry's own path.** The browser then sends it
 * to that entry and to nothing else, so "remembered for that entry alone" holds
 * in the browser as well as in the signature. Opening one protected entry does
 * not open another.
 *
 * **The signature covers the stored hash.** Changing an entry's password
 * therefore invalidates every ticket issued for the old one, without anything
 * having to be revoked anywhere.
 */

/** The cookie the browser carries back, scoped to the entry it opens. */
export const UNLOCK_COOKIE = "entry-unlock";

/**
 * How long an answer is remembered.
 *
 * Long enough that reading an entry over a few evenings does not ask again,
 * short enough that a ticket taken from a shared machine stops working. The
 * value is signed into the ticket rather than left to the cookie's own expiry,
 * because a cookie's expiry is a request from the server that the client is
 * free to ignore.
 */
const TICKET_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The shortest secret this accepts.
 *
 * A short secret is a guessable one, and a ticket forged from a guessed secret
 * opens every protected entry at once. 32 characters is what the deployment
 * notes ask for and what an absent variable is measured against.
 */
const MINIMUM_SECRET_LENGTH = 32;

/** How many attempts one source may make against one entry, and over how long. */
const ATTEMPT_LIMIT = 10;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

/**
 * Why a request to open an entry was refused, as far as the visitor is told.
 *
 * `unavailable` is deliberately distinct from `wrong`: the first says the site
 * cannot open anything at all right now, which is true when the secret is
 * missing, and telling somebody their password was wrong in that situation
 * sends them looking for a mistake they did not make.
 */
export type UnlockRefusal = "wrong" | "too-many" | "unavailable";

/** What a bucket of attempts holds. */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/**
 * How often spent buckets are swept out.
 *
 * Without this the map keeps a key for every source that ever tried, which is a
 * slow leak rather than a fast one and therefore the kind nobody notices.
 */
const SWEEP_INTERVAL_MS = 60_000;
const sweep = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, SWEEP_INTERVAL_MS);
// So that a process with nothing else to do can still exit, which a test runner
// and a shutdown both need.
sweep.unref();

/** Empties every bucket. For a test, and for nothing else. */
export function forgetUnlockAttempts(): void {
  buckets.clear();
}

/**
 * The secret this deployment signs tickets with, or null when it has none.
 *
 * Read per call rather than at module load, so a test can set it and so that a
 * process started without it reports the same thing on every request instead of
 * once at boot. A secret that is too short counts as absent, which fails closed:
 * a protected entry stays shut rather than opening on a weak signature.
 */
function secret(): string | null {
  const value = process.env.WEBSITE_UNLOCK_SECRET?.trim();
  return value && value.length >= MINIMUM_SECRET_LENGTH ? value : null;
}

/** Whether this deployment can open a protected entry at all. */
export function canUnlock(): boolean {
  return secret() !== null;
}

/**
 * How the ticket cookie is written, decided once.
 *
 * The path is the entry's own, so the browser sends the ticket to that entry
 * and to nothing else. `__Host-` is therefore not available, since it requires
 * `Path=/`, which is exactly the property this cookie must not have.
 *
 * `Lax` lets somebody arrive from an external link and still be recognised,
 * whilst a cross-site subrequest cannot use the ticket. Astro refuses a
 * cross-origin form post by itself, through `security.checkOrigin`, which is on
 * by default in the version this builds against.
 *
 * @param path - The entry the ticket opens.
 * @param production - Whether this is a deployed build, which decides `Secure`.
 *   A development server speaks HTTP, and a `Secure` cookie there is one the
 *   browser drops silently.
 */
export function ticketCookieOptions(path: string, production: boolean) {
  return {
    path,
    httpOnly: true,
    secure: production,
    sameSite: "lax" as const,
    maxAge: Math.floor(TICKET_LIFETIME_MS / 1000),
  };
}

/**
 * Signs what a ticket claims.
 *
 * @param key - The signing secret.
 * @param path - The entry the ticket opens.
 * @param passwordHash - The stored hash the ticket was issued against.
 * @param expiresAt - When the ticket stops being accepted, in milliseconds.
 */
function sign(key: string, path: string, passwordHash: string, expiresAt: number): string {
  return createHmac("sha256", key).update(`${path}\n${passwordHash}\n${expiresAt}`).digest("base64url");
}

/**
 * A ticket saying this visitor answered this entry's question.
 *
 * @returns The cookie value, or null when the site has no secret to sign with.
 */
export function issueTicket(path: string, passwordHash: string, now = Date.now()): string | null {
  const key = secret();
  if (!key) return null;
  const expiresAt = now + TICKET_LIFETIME_MS;
  return `${expiresAt}.${sign(key, path, passwordHash, expiresAt)}`;
}

/**
 * Whether a ticket the browser sent still opens this entry.
 *
 * Refuses on a missing secret, a malformed value, an expired claim, a signature
 * that does not match, and a hash that has changed since the ticket was issued.
 * Every one of those is the same answer to the visitor: the entry asks again.
 *
 * @param ticket - The cookie value as it arrived, or undefined.
 * @param path - The entry being read.
 * @param passwordHash - The hash currently stored for that entry.
 */
export function ticketOpens(
  ticket: string | undefined,
  path: string,
  passwordHash: string,
  now = Date.now(),
): boolean {
  const key = secret();
  if (!key || !ticket) return false;
  const separator = ticket.indexOf(".");
  if (separator < 1) return false;
  const expiresAt = Number(ticket.slice(0, separator));
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return false;
  const presented = Buffer.from(ticket.slice(separator + 1), "base64url");
  const expected = Buffer.from(sign(key, path, passwordHash, expiresAt), "base64url");
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}

/**
 * The bucket a request counts against.
 *
 * One entry and one source, so somebody guessing at one entry cannot shut a
 * reader out of another, and a second reader of the same entry is not counted
 * against the first.
 */
function bucketKey(path: string, forwardedFor: string | null | undefined): string {
  return `${path}|${callerAddress(forwardedFor)}`;
}

/**
 * Counts one attempt and says whether it may go ahead.
 *
 * Counted before the password is checked rather than after a failure, because
 * each attempt costs the server 32 MiB of scrypt whether it succeeds or not,
 * and an attacker who never guesses correctly would otherwise be unlimited.
 */
function attemptAllowed(path: string, forwardedFor: string | null | undefined, now: number): boolean {
  const key = bucketKey(path, forwardedFor);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= ATTEMPT_LIMIT;
}

/** What an attempt produced: a ticket to set, or the reason it was refused. */
export type UnlockOutcome = { ticket: string } | { refusal: UnlockRefusal };

/**
 * Checks a password typed for a protected entry.
 *
 * @param input.password - What was typed. Never logged, never echoed back.
 * @param input.path - The entry being opened, which scopes both the limit and
 *   the ticket.
 * @param input.passwordHash - The stored hash for that entry.
 * @param input.forwardedFor - The request's `X-Forwarded-For`, for the limit.
 * @returns A ticket to put in the cookie, or why the visitor is refused.
 */
export async function attemptUnlock({
  password,
  path,
  passwordHash,
  forwardedFor,
  now = Date.now(),
}: {
  password: string;
  path: string;
  passwordHash: string;
  forwardedFor: string | null | undefined;
  now?: number;
}): Promise<UnlockOutcome> {
  if (!canUnlock()) return { refusal: "unavailable" };
  if (!attemptAllowed(path, forwardedFor, now)) return { refusal: "too-many" };
  if (!(await verifyPassword(password, passwordHash))) return { refusal: "wrong" };
  const ticket = issueTicket(path, passwordHash, now);
  return ticket ? { ticket } : { refusal: "unavailable" };
}
