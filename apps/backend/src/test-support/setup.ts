import { afterEach, beforeEach, vi } from "vitest";
import { forgetRateLimits } from "../http/rate-limit.js";

/**
 * What every test starts from, whatever file it is in.
 *
 * The rate limiter counts in memory and the application under test is a single
 * shared instance, so without this a file that signs in thirty times leaves the
 * next file refused. Clearing it here rather than in each file means a test
 * written later cannot forget, and forgetting shows up as an unrelated test
 * failing somewhere else.
 */
beforeEach(() => {
  forgetRateLimits();
});

/**
 * A faked clock is put back whatever happened.
 *
 * A test that times out never reaches its own `finally`, so a clock it faked
 * stays faked and every test after it in that file fails for a reason that has
 * nothing to do with what it was checking.
 */
afterEach(() => {
  vi.useRealTimers();
});
