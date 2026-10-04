import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { sessionSecret } from "../config.js";

const MIN_AGE_MS = 2_000;
const MAX_AGE_MS = 3_600_000;

/** A form-specific, short-lived timestamp signed by the backend. */
export function issueFormChallenge(slug: string, now = Date.now()): string {
  const value = `${now}.${randomBytes(12).toString("base64url")}`;
  const signature = createHmac("sha256", sessionSecret).update(`${slug}.${value}`).digest("base64url");
  return `${value}.${signature}`;
}

export function verifyFormChallenge(slug: string, token: string, now = Date.now()): boolean {
  const parts = /^(\d{13})\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!parts) return false;
  const issuedAt = Number(parts[1]);
  const age = now - issuedAt;
  if (!Number.isSafeInteger(issuedAt) || age < MIN_AGE_MS || age > MAX_AGE_MS) return false;
  const value = `${parts[1]}.${parts[2]}`;
  const expected = createHmac("sha256", sessionSecret).update(`${slug}.${value}`).digest();
  const actual = Buffer.from(parts[3] ?? "", "base64url");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
