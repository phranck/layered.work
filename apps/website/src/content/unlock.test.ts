import { hashPassword } from "@layered/passwords";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  attemptUnlock,
  canUnlock,
  forgetUnlockAttempts,
  issueTicket,
  ticketCookieOptions,
  ticketOpens,
} from "./unlock.js";

const SECRET = "a-secret-long-enough-to-be-accepted";
const PATH = "/de/ein-geschuetzter-beitrag/";
const OTHER_PATH = "/de/ein-anderer-beitrag/";
const PASSWORD = "the password";

let hash: string;

beforeEach(async () => {
  process.env.WEBSITE_UNLOCK_SECRET = SECRET;
  forgetUnlockAttempts();
  hash ??= await hashPassword(PASSWORD);
});

afterEach(() => {
  delete process.env.WEBSITE_UNLOCK_SECRET;
});

describe("the gate in front of a protected entry", () => {
  it("opens for the password it was given and refuses every other", async () => {
    const opened = await attemptUnlock({
      password: PASSWORD,
      path: PATH,
      passwordHash: hash,
      forwardedFor: null,
    });
    expect("ticket" in opened).toBe(true);
    const refused = await attemptUnlock({
      password: "wrong",
      path: PATH,
      passwordHash: hash,
      forwardedFor: null,
    });
    expect(refused).toEqual({ refusal: "wrong" });
  });

  it("stays shut when the site has no secret to sign with", async () => {
    delete process.env.WEBSITE_UNLOCK_SECRET;
    expect(canUnlock()).toBe(false);
    expect(
      await attemptUnlock({ password: PASSWORD, path: PATH, passwordHash: hash, forwardedFor: null }),
    ).toEqual({
      refusal: "unavailable",
    });
    expect(issueTicket(PATH, hash)).toBeNull();
  });

  it("treats a secret that is too short as no secret at all", () => {
    process.env.WEBSITE_UNLOCK_SECRET = "short";
    expect(canUnlock()).toBe(false);
  });

  it("refuses a ticket issued for another entry", () => {
    const ticket = issueTicket(PATH, hash);
    if (!ticket) throw new Error("A ticket was expected");
    expect(ticketOpens(ticket, PATH, hash)).toBe(true);
    expect(ticketOpens(ticket, OTHER_PATH, hash)).toBe(false);
  });

  it("refuses a ticket once the entry's password has changed", async () => {
    const ticket = issueTicket(PATH, hash);
    if (!ticket) throw new Error("A ticket was expected");
    expect(ticketOpens(ticket, PATH, await hashPassword("something else"))).toBe(false);
  });

  it("refuses an expired ticket, a tampered one and a malformed one", () => {
    const issuedAt = Date.now();
    const ticket = issueTicket(PATH, hash, issuedAt);
    if (!ticket) throw new Error("A ticket was expected");
    const thirtyOneDays = 31 * 24 * 60 * 60 * 1000;
    expect(ticketOpens(ticket, PATH, hash, issuedAt + thirtyOneDays)).toBe(false);
    const [expiry, signature] = ticket.split(".");
    expect(ticketOpens(`${Number(expiry) + thirtyOneDays}.${signature}`, PATH, hash)).toBe(false);
    for (const malformed of ["", ".", "no-dot", `${expiry}.`, `.${signature}`, "abc.def"]) {
      expect(ticketOpens(malformed, PATH, hash)).toBe(false);
    }
  });

  it("refuses a ticket signed with a different secret", () => {
    const ticket = issueTicket(PATH, hash);
    if (!ticket) throw new Error("A ticket was expected");
    process.env.WEBSITE_UNLOCK_SECRET = "another-secret-long-enough-to-pass";
    expect(ticketOpens(ticket, PATH, hash)).toBe(false);
  });

  it("counts attempts per entry and per source, and stops at the limit", async () => {
    const attempt = (path: string, forwardedFor: string | null) =>
      attemptUnlock({ password: "wrong", path, passwordHash: hash, forwardedFor });
    const chain = "1.2.3.4, 10.0.0.1, 10.0.0.2";
    for (let index = 0; index < 10; index += 1) {
      expect(await attempt(PATH, chain)).toEqual({ refusal: "wrong" });
    }
    expect(await attempt(PATH, chain)).toEqual({ refusal: "too-many" });
    // Prepending a different address does not make a different source: the
    // caller is two from the end, and everything before it is what they typed.
    expect(await attempt(PATH, "9.9.9.9, 10.0.0.1, 10.0.0.2")).toEqual({ refusal: "too-many" });
    // Another entry from the same source, and the same entry from a source the
    // infrastructure actually saw differently: both untouched.
    expect(await attempt(OTHER_PATH, chain)).toEqual({ refusal: "wrong" });
    expect(await attempt(PATH, "1.2.3.4, 10.0.0.9, 10.0.0.2")).toEqual({ refusal: "wrong" });
  });

  it("counts a correct password against the limit too, so guessing cannot be free", async () => {
    const chain = "1.2.3.4, 10.0.0.1, 10.0.0.2";
    for (let index = 0; index < 10; index += 1) {
      await attemptUnlock({ password: "wrong", path: PATH, passwordHash: hash, forwardedFor: chain });
    }
    expect(
      await attemptUnlock({ password: PASSWORD, path: PATH, passwordHash: hash, forwardedFor: chain }),
    ).toEqual({ refusal: "too-many" });
  });

  it("scopes the cookie to the entry and keeps it out of scripts", () => {
    expect(ticketCookieOptions(PATH, true)).toEqual({
      path: PATH,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
    });
    expect(ticketCookieOptions(PATH, false).secure).toBe(false);
  });
});
