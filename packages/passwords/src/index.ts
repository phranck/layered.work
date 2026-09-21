import { randomBytes, type ScryptOptions, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Turning a password into something that can be checked but not read back.
 *
 * **scrypt rather than bcrypt or argon2id.** The issue that planned this named
 * the other two, and the seed had already been written with scrypt by the time
 * it was worked: it is memory-hard, it is in Node's own standard library so it
 * adds no dependency to a security primitive, and the parameters travel inside
 * the stored value, so raising the cost later leaves every existing hash
 * verifiable. Nothing about the other two would be better here.
 *
 * **One copy, in a package of its own.** A hashing or comparing function that
 * exists twice is the failure `code-quality.md` names first, because a change
 * reaching one copy leaves the other doing the old thing and nothing reports
 * it. It had been written twice in the backend alone, in the sign-in route and
 * in the seed, which is why it is a package rather than a file in either.
 *
 * **Server only.** It reads `node:crypto` and it spends 32 MiB per call, so it
 * belongs nowhere a browser bundle can reach.
 */

/**
 * The promised form, typed by hand.
 *
 * `promisify` reads the first of the callback's overloads, which is the one
 * without the options object, so the parameters below would otherwise be an
 * error at every call whilst working perfectly at run time.
 */
const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/**
 * The cost of hashing a password, high enough to be felt.
 *
 * A password is the one low-entropy secret in this system, so the work is the
 * defence. `N` of 2^15 with `r` of 8 is 32 MiB of memory per attempt, which is
 * what makes a graphics card a poor tool for guessing them. These are the
 * parameters a hash is written with; the stored value carries them, so raising
 * them later leaves every old hash verifiable.
 *
 * The same figure is why every caller needs a limit in front of it: an attempt
 * costs the server 32 MiB, and nothing about the algorithm makes that cheaper
 * for whoever is asking.
 */
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keyLength: 64, saltBytes: 16 } as const;

/** What `scrypt` needs beyond the defaults to run at the cost above. */
const memoryFor = (n: number, r: number) => 256 * n * r;

/**
 * Hashes a password so that the parameters travel with it.
 *
 * @param password - What the person typed.
 * @returns `scrypt$N$r$p$salt$hash`, all base64url.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SCRYPT.saltBytes);
  const derived = await scrypt(password, salt, SCRYPT.keyLength, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: memoryFor(SCRYPT.N, SCRYPT.r),
  });
  return [
    "scrypt",
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

/**
 * Checks a password against a stored hash, in constant time.
 *
 * @param password - What was typed now.
 * @param stored - What was written when the account or the entry was made.
 * @returns Whether they are the same, without revealing where they first differ.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, expected] = stored.split("$");
  if (scheme !== "scrypt" || !n || !r || !p || !salt || !expected) return false;

  const expectedBytes = Buffer.from(expected, "base64url");
  const derived = await scrypt(password, Buffer.from(salt, "base64url"), expectedBytes.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: memoryFor(Number(n), Number(r)),
  });
  return derived.length === expectedBytes.length && timingSafeEqual(derived, expectedBytes);
}

/**
 * A hash of a value nobody knows, to be verified against when nothing matched.
 *
 * **This is what makes an absent record indistinguishable from a wrong
 * password.** Returning early on "no such thing" skips the scrypt work, and
 * scrypt at this cost takes long enough to measure over a network, so the early
 * return answers the question "does this exist here" to anybody with a
 * stopwatch. Verifying against this instead spends the same time and reaches
 * the same answer.
 *
 * Built by the caller at start-up and held, rather than per request: building
 * it per request would itself cost a hash and would make the absent case the
 * slower of the two.
 */
export function unmatchableHash(): Promise<string> {
  return hashPassword(randomBytes(32).toString("base64url"));
}
