import { hashPassword } from "@layered/passwords";
import { emailAddress } from "@layered/schemas";
import { drizzle } from "drizzle-orm/postgres-js";
import { connectOnce, databaseUrl } from "./connect.js";
import { users } from "./schema/people.js";

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
 * Puts the first account in, if there is not one already.
 *
 * @returns What happened, so the caller can say it rather than guess.
 */
export async function seedOwner(): Promise<{ created: boolean; detail: string }> {
  const givenEmail = process.env[EMAIL];
  const password = process.env[PASSWORD];
  const displayName = process.env[NAME]?.trim();

  if (!givenEmail || !password || !displayName) {
    throw new Error(`${EMAIL}, ${PASSWORD} and ${NAME} all have to be set to seed an account.`);
  }
  // Read as the sign-in reads it, so the address seeded is the address that signs in.
  const parsedEmail = emailAddress.safeParse(givenEmail);
  if (!parsedEmail.success) throw new Error(`${EMAIL} is not an email address.`);
  const email = parsedEmail.data;

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
