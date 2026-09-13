import { ErrorCode, readApiError } from "@layered/schemas";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "../auth/password.js";
import { users } from "../db/schema/index.js";
import {
  closeTestDatabase,
  emptyTestDatabase,
  hasTestDatabase,
  testDatabase,
} from "../test-support/database.js";
import { app } from "./app.js";
import { sourceFingerprint } from "./caller.js";
import { forgetRateLimits } from "./rate-limit.js";
import { SIGN_IN_PER_ACCOUNT } from "./routes/auth.js";

/**
 * How often the same caller may try, and what is written down when they stop
 * being allowed to.
 */

const runs = hasTestDatabase ? describe : describe.skip;

/** Two accounts, so that limiting one can be shown not to touch the other. */
const ONE = { email: "one@layered.test", password: "the-first-password" };
const OTHER = { email: "other@layered.test", password: "the-second-password" };

/** One attempt, with a wrong password, from a named address. */
function attempt(email: string, address = "203.0.113.10") {
  return app.request("/auth/sign-in", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": address },
    body: JSON.stringify({ email, password: "not-the-password" }),
  });
}

runs("the sign-in limit", () => {
  beforeAll(async () => {
    const database = await testDatabase();
    await emptyTestDatabase();
    for (const account of [ONE, OTHER]) {
      await database.insert(users).values({
        email: account.email,
        passwordHash: await hashPassword(account.password),
        displayName: account.email,
        role: "owner",
      });
    }
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  beforeEach(() => {
    forgetRateLimits();
  });

  it("refuses once one account has been tried too often", async () => {
    let last: Response | undefined;
    for (let tries = 0; tries <= SIGN_IN_PER_ACCOUNT.limit; tries += 1) {
      last = await attempt(ONE.email);
    }

    expect(last?.status).toBe(429);
    expect(readApiError(await (last as Response).json())?.code).toBe(ErrorCode.RateLimited);
  });

  it("leaves a different account alone", async () => {
    for (let tries = 0; tries <= SIGN_IN_PER_ACCOUNT.limit; tries += 1) {
      await attempt(ONE.email);
    }

    // The same address, so only the per-account bucket can be the difference.
    const other = await attempt(OTHER.email);
    expect(other.status).toBe(401);
  });

  it("counts an account however many addresses it is tried from", async () => {
    // The limit that matters: somebody with a list of addresses uses a fresh
    // source for each attempt, so a per-address limit alone never fires.
    let last: Response | undefined;
    for (let tries = 0; tries <= SIGN_IN_PER_ACCOUNT.limit; tries += 1) {
      last = await attempt(ONE.email, `198.51.100.${tries}`);
    }

    expect(last?.status).toBe(429);
  });

  it("says how long to wait", async () => {
    let last: Response | undefined;
    for (let tries = 0; tries <= SIGN_IN_PER_ACCOUNT.limit; tries += 1) {
      last = await attempt(ONE.email);
    }

    const retryAfter = Number(last?.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(SIGN_IN_PER_ACCOUNT.windowSeconds);
  });

  it("counts a correct password too, so the limit does not depend on the outcome", async () => {
    for (let tries = 0; tries < SIGN_IN_PER_ACCOUNT.limit; tries += 1) {
      await attempt(ONE.email);
    }

    const correct = await app.request("/auth/sign-in", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.10" },
      body: JSON.stringify({ email: ONE.email, password: ONE.password }),
    });

    expect(correct.status).toBe(429);
  });

  it("lets a request through again once the window has passed", async () => {
    // Only the clock, not the timers. Faking `setTimeout` as well would stop
    // the database driver's own timers from ever firing, so the request never
    // comes back and the test times out rather than failing.
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      for (let tries = 0; tries <= SIGN_IN_PER_ACCOUNT.limit; tries += 1) {
        await attempt(ONE.email);
      }
      expect((await attempt(ONE.email)).status).toBe(429);

      vi.setSystemTime(Date.now() + (SIGN_IN_PER_ACCOUNT.windowSeconds + 1) * 1000);
      expect((await attempt(ONE.email)).status).toBe(401);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("what a refusal is written down as", () => {
  const written: { fields: Record<string, unknown>; message: string }[] = [];

  beforeEach(async () => {
    forgetRateLimits();
    written.length = 0;
    const { logger } = await import("../logger.js");
    vi.spyOn(logger, "warn").mockImplementation(((fields: Record<string, unknown>, message: string) => {
      written.push({ fields, message });
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("carries a hash of the source and never the address itself", async () => {
    const address = "203.0.113.99";
    for (let tries = 0; tries <= SIGN_IN_PER_ACCOUNT.limit; tries += 1) {
      await attempt("someone@layered.test", address);
    }

    const refusals = written.filter((line) => line.fields.deviation === true);
    expect(refusals.length).toBeGreaterThan(0);

    const asText = JSON.stringify(refusals);
    expect(asText).not.toContain(address);
    expect(asText).toContain(sourceFingerprint(address));
  });

  it("is marked as a deviation, and says which limiter and which route", async () => {
    for (let tries = 0; tries <= SIGN_IN_PER_ACCOUNT.limit; tries += 1) {
      await attempt("someone@layered.test");
    }

    const refusal = written.find((line) => line.fields.deviation === true);
    expect(refusal?.fields.limiter).toBe(SIGN_IN_PER_ACCOUNT.name);
    expect(refusal?.fields.route).toBe("/auth/sign-in");
    expect(refusal?.message).toBe("refused by a rate limit");
  });

  it("records how many proxies the request came through, rather than through whom", async () => {
    // The number is what says whether the assumption about the topology still
    // holds. A chain of one is one proxy in front, which is the deployment.
    for (let tries = 0; tries <= SIGN_IN_PER_ACCOUNT.limit; tries += 1) {
      await attempt("someone@layered.test", "198.51.100.1, 203.0.113.7");
    }

    const refusal = written.find((line) => line.fields.deviation === true);
    expect(refusal?.fields.hops).toBe(2);
  });

  it("holds the address the trusted proxy appended, not the one the caller prepended", async () => {
    const spoofed = "1.2.3.4";
    const real = "203.0.113.55";
    for (let tries = 0; tries <= SIGN_IN_PER_ACCOUNT.limit; tries += 1) {
      await attempt("someone@layered.test", `${spoofed}, ${real}`);
    }

    const refusal = written.find((line) => line.fields.deviation === true);
    expect(refusal?.fields.source).toBe(sourceFingerprint(real));
    expect(refusal?.fields.source).not.toBe(sourceFingerprint(spoofed));
  });
});
