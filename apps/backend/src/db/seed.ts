import { randomBytes, type ScryptOptions, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { drizzle } from "drizzle-orm/postgres-js";
import { connectOnce, databaseUrl } from "./connect.js";
import { users } from "./schema/people.js";

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
 * Creates the one account this site starts with, and refuses to do it twice.
 *
 * It refuses on the table being occupied rather than on the email already
 * existing, because the question it is answering is "has this database been set
 * up" and not "does this person exist". Run again after somebody has signed up,
 * an upsert would quietly rewrite their password from an environment variable.
 */

/** What the environment has to name. */
const EMAIL = "SEED_EMAIL";
const PASSWORD = "SEED_PASSWORD";
const NAME = "SEED_NAME";

/**
 * The cost of hashing a password, high enough to be felt.
 *
 * A password is the one low-entropy secret in this system, so the work is the
 * defence. These are the parameters the hash is written with; the stored value
 * carries them, so raising them later leaves every old hash verifiable.
 */
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keyLength: 64, saltBytes: 16 } as const;

/**
 * Hashes a password so that the parameters travel with it.
 *
 * @param password - What the person typed.
 * @returns `scrypt$N$r$p$salt$hash`, all base64url.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SCRYPT.saltBytes);
  const derived = (await scrypt(password, salt, SCRYPT.keyLength, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    // scrypt needs room for the parameters above, and Node's default is smaller.
    maxmem: 256 * SCRYPT.N * SCRYPT.r,
  })) as Buffer;
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
 * @param stored - What was written when the account was made.
 * @returns Whether they are the same, without revealing where they first differ.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, expected] = stored.split("$");
  if (scheme !== "scrypt" || !n || !r || !p || !salt || !expected) return false;

  const expectedBytes = Buffer.from(expected, "base64url");
  const derived = (await scrypt(password, Buffer.from(salt, "base64url"), expectedBytes.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 256 * Number(n) * Number(r),
  })) as Buffer;
  return derived.length === expectedBytes.length && timingSafeEqual(derived, expectedBytes);
}

/**
 * Puts the first account in, if there is not one already.
 *
 * @returns What happened, so the caller can say it rather than guess.
 */
export async function seedOwner(): Promise<{ created: boolean; detail: string }> {
  const email = process.env[EMAIL]?.trim().toLowerCase();
  const password = process.env[PASSWORD];
  const displayName = process.env[NAME]?.trim();

  if (!email || !password || !displayName) {
    throw new Error(`${EMAIL}, ${PASSWORD} and ${NAME} all have to be set to seed an account.`);
  }

  const sql = connectOnce(databaseUrl());
  try {
    const database = drizzle(sql, { schema: { users } });
    const existing = await database.select({ id: users.id }).from(users).limit(1);
    if (existing.length > 0) {
      return { created: false, detail: "an account exists already, so nothing was written" };
    }

    await database.insert(users).values({
      email,
      passwordHash: await hashPassword(password),
      displayName,
      role: "owner",
    });
    return { created: true, detail: `created the owner ${email}` };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Run when this file is the command rather than an import.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  try {
    const { detail } = await seedOwner();
    process.stdout.write(`${detail}\n`);
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
  }
}
