import { ErrorCode } from "@layered/schemas";
import type { Context, MiddlewareHandler } from "hono";
import { deviation } from "../logger.js";
import { forwardedChain, sourceAddress, sourceFingerprint } from "./caller.js";
import { HttpError } from "./response.js";

/**
 * How often the same caller may try the same thing.
 *
 * **Counted per caller, never per path.** The middleware is put on the routes
 * that need it, so there is no path matching at all: nothing to compare by
 * prefix and nothing to accidentally exempt. What a request is counted against
 * is decided by the route, which knows whether "the same caller" means an
 * address, an account, or both.
 *
 * **In memory, on purpose.** This service runs one container, so a shared store
 * would be a dependency bought for nothing. The cost is that a restart forgets
 * everybody, which turns a restart into a way of clearing a limit; that matters
 * when somebody can cause restarts, and nobody can here. A second container
 * would make this wrong, and the comment is where that is written down.
 */

/** What a bucket holds. */
type Bucket = { count: number; resetAt: number };

/** Every bucket, keyed by limiter name and caller. */
const buckets = new Map<string, Bucket>();

/**
 * How often the old ones are swept out.
 *
 * Without this the map keeps a key for every address that ever tried, which is
 * a slow leak rather than a fast one and therefore the kind nobody notices.
 */
const SWEEP_INTERVAL_MS = 60_000;

const sweep = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, SWEEP_INTERVAL_MS);

// So that a process with nothing else to do can still exit, which is what a
// test runner and a shutdown both need.
sweep.unref();

/** Empties every bucket. For a test, and for nothing else. */
export function forgetRateLimits(): void {
  buckets.clear();
}

/** What a route says about how it is limited. */
type Limits = {
  /** Names the set of buckets, so two limiters cannot collide on one key. */
  name: string;
  /** How many attempts are allowed in the window. */
  limit: number;
  /** How long the window is. */
  windowSeconds: number;
  /**
   * What this request is counted against, which may be several things at once.
   * Every one of them has to be under its limit.
   */
  keys: (c: Context) => string[];
};

/** Counts one attempt, and says whether it was allowed. */
function take(key: string, limit: number, windowMs: number): { allowed: boolean; resetAt: number } {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    const fresh = { count: 1, resetAt: now + windowMs };
    buckets.set(key, fresh);
    return { allowed: true, resetAt: fresh.resetAt };
  }

  existing.count += 1;
  return { allowed: existing.count <= limit, resetAt: existing.resetAt };
}

/**
 * Middleware that refuses a caller who has tried too often.
 *
 * The attempt is counted before the handler runs and is not refunded when the
 * handler succeeds. Counting only failures would mean an attacker who guesses
 * correctly gets an unlimited number of further attempts, and it would make the
 * limit depend on the outcome, which is the thing being hidden.
 *
 * @param limits - What this route counts and how far it lets it go.
 */
export function rateLimit(limits: Limits): MiddlewareHandler {
  const windowMs = limits.windowSeconds * 1000;

  return async (c, next) => {
    const address = sourceAddress(c);
    let refusedAt = 0;

    for (const key of limits.keys(c)) {
      const { allowed, resetAt } = take(`${limits.name}:${key}`, limits.limit, windowMs);
      // Every key is taken, not only the ones before the first refusal, so a
      // caller cannot spend somebody else's allowance for free by being over
      // their own.
      if (!allowed) refusedAt = Math.max(refusedAt, resetAt);
    }

    if (refusedAt > 0) {
      const seconds = Math.max(1, Math.ceil((refusedAt - Date.now()) / 1000));
      c.header("Retry-After", String(seconds));

      deviation("refused by a rate limit", {
        requestId: c.get("requestId"),
        limiter: limits.name,
        route: c.req.routePath,
        // Hashed, because a log of addresses is a record of who tried what, and
        // the only question here is whether one source is doing this repeatedly.
        source: sourceFingerprint(address),
        // The length of the chain rather than its contents, which is what says
        // whether the assumption about how many proxies are in front still holds.
        hops: forwardedChain(c).length,
        retryAfterSeconds: seconds,
      });

      throw new HttpError(ErrorCode.RateLimited, "Too many attempts. Try again shortly.");
    }

    await next();
  };
}

/** The caller's address, as a key. */
export const byAddress = (c: Context): string => `address:${sourceAddress(c)}`;

/**
 * The account being named, as a key.
 *
 * Read from the validated body rather than from the raw one, so the limiter
 * cannot be keyed by a megabyte of nonsense. An address that is not there at
 * all counts as one bucket, which limits more rather than less.
 */
export function byAccount(c: Context): string {
  const body = c.req.valid("json" as never) as { email?: string } | undefined;
  return `account:${body?.email?.trim().toLowerCase() ?? "none"}`;
}
