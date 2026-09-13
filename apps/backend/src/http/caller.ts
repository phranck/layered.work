import { createHash } from "node:crypto";
import type { Context } from "hono";

/**
 * Who is asking, as far as the network can say.
 *
 * **A forwarded header is attacker input.** Anybody can send
 * `X-Forwarded-For: 1.2.3.4`, so reading the first entry of that list means a
 * per-source limit is per-whatever-the-caller-typed, which is no limit at all.
 *
 * What cannot be forged is what a trusted proxy appends to the end. This
 * service sits directly behind the Zerops layer-7 proxy with nothing in front
 * of it, so the last entry is the address that proxy saw the connection come
 * from, whatever the caller prepended to the list.
 *
 * **That assumption is about the infrastructure, so it is checked rather than
 * believed.** The rate limiter records how many entries the chain had when it
 * refused a request, and a chain of one is what one proxy in front looks like.
 * Putting a CDN in front would make it two, and the entry to read would then be
 * the second from last.
 */

/** How many proxies are in front. One, and the deployment is what makes that true. */
const TRUSTED_HOPS = 1;

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
  return chain[chain.length - TRUSTED_HOPS] ?? UNKNOWN;
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
