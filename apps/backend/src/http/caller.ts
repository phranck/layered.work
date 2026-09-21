import { createHash } from "node:crypto";
import { callerAddress } from "@layered/policy";
import type { Context } from "hono";

/**
 * Who is asking, as far as the network can say, in the shape Hono hands over.
 *
 * Which entry of a forwarded chain that is, and why, is written down once in
 * `@layered/policy`. This file is the part that reads a Hono request and the
 * part that makes an address safe to log.
 */

/** The chain as it arrived, for counting rather than for reading. */
export function forwardedChain(c: Context): string[] {
  const header = c.req.header("x-forwarded-for");
  if (!header) return [];
  return header
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * The address to hold responsible for this request.
 *
 * Which entry of the chain that is belongs to `@layered/policy`, because the
 * site's password gate counts against the same answer and the two must not
 * disagree about who is asking.
 *
 * @returns The address, or `unknown` when nothing said.
 */
export function sourceAddress(c: Context): string {
  return callerAddress(c.req.header("x-forwarded-for"));
}

/**
 * A source as it may appear in a log.
 *
 * An address is personal data and a log of them is a record of who read what.
 * The hash is enough to see that one source is doing something repeatedly,
 * which is the only question a log line about a rate limit has to answer.
 *
 * Truncated because the full digest says nothing more for that purpose, and
 * a shorter value is one somebody might actually compare by eye.
 */
export function sourceFingerprint(address: string): string {
  return createHash("sha256").update(address).digest("hex").slice(0, 12);
}
