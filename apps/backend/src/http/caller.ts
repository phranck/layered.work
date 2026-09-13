import { createHash } from "node:crypto";
import type { Context } from "hono";

/**
 * Who is asking, as far as the network can say.
 *
 * **A forwarded header is attacker input.** Anybody can send
 * `X-Forwarded-For: 1.2.3.4`, so reading the first entry of that list means a
 * per-source limit is per-whatever-the-caller-typed, which is no limit at all.
 *
 * What cannot be forged is what the infrastructure appends. Measured against
 * the deployed service on 13 September 2026, by sending a request with a
 * spoofed header and reading the chain back out of the log:
 *
 * ```
 * X-Forwarded-For: 1.2.3.4   ->   [1.2.3.4, <the caller>, <a Zerops hop>]
 * nothing sent               ->   [<the caller>, <a Zerops hop>]
 * ```
 *
 * Zerops appends the address it saw the connection come from, and then one more
 * internal hop appends its own. The caller is therefore always **two from the
 * end**, whatever they prepended, and the number below is that two.
 *
 * Reading the last entry instead puts every caller into one bucket, because
 * that entry is the same Zerops hop for everybody, which turns a per-source
 * limit into a global one. That is exactly what the first measurement found.
 */

/**
 * How far from the end of the chain the caller is.
 *
 * Not a count of proxies to believe in: a figure read off the deployed service.
 * A CDN in front would add one more entry and make this three, and the rate
 * limiter logs the whole chain, hashed, on every refusal so that the change is
 * visible rather than silent.
 */
const CLIENT_FROM_END = 2;

/** What a source is called when there is nothing to go on. */
const UNKNOWN = "unknown";

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
 * @returns The address, or `unknown` when nothing said. `unknown` is one bucket
 *   shared by everything that arrives without a chain, which is the safe
 *   direction: it limits more, not less.
 */
export function sourceAddress(c: Context): string {
  const chain = forwardedChain(c);
  return chain[chain.length - CLIENT_FROM_END] ?? UNKNOWN;
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
