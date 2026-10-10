import { randomBytes } from "node:crypto";
import { sign, signedFor } from "../auth/signature.js";

/** How soon a challenge may be answered: a person takes longer than this to fill in a form. */
const MIN_AGE_MS = 2_000;

/** How long a challenge stays answerable. */
const MAX_AGE_MS = 3_600_000;

/** What the signature covers: the form it was issued for and the challenge's own value. */
const signed = (slug: string, value: string) => `${slug}.${value}`;

/**
 * A form-specific, short-lived timestamp signed by the backend.
 *
 * Signed with the form challenge's own key, so a challenge never passes as any
 * other signed value this API hands out, a session cookie included.
 *
 * @param slug - The form it is issued for.
 * @param now - The current time, which a test can fix.
 */
export function issueFormChallenge(slug: string, now = Date.now()): string {
  const value = `${now}.${randomBytes(12).toString("base64url")}`;
  return `${value}.${sign("form-challenge", signed(slug, value))}`;
}

/**
 * Whether a challenge was issued here for this form, and is neither too fresh nor too old.
 *
 * @param slug - The form being submitted.
 * @param token - The challenge as it arrived.
 * @param now - The current time, which a test can fix.
 */
export function verifyFormChallenge(slug: string, token: string, now = Date.now()): boolean {
  const parts = /^(\d{13})\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!parts) return false;
  const issuedAt = Number(parts[1]);
  const age = now - issuedAt;
  if (!Number.isSafeInteger(issuedAt) || age < MIN_AGE_MS || age > MAX_AGE_MS) return false;
  return signedFor("form-challenge", signed(slug, `${parts[1]}.${parts[2]}`), parts[3] ?? "");
}
