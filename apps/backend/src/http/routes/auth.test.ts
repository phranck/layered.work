import { hashPassword } from "@layered/passwords";
import { readApiError, type SignedInAs } from "@layered/schemas";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SESSION_COOKIE } from "../../auth/cookie.js";
import { sessions, users } from "../../db/schema/index.js";
import {
  closeTestDatabase,
  emptyTestDatabase,
  hasTestDatabase,
  testDatabase,
} from "../../test-support/database.js";
import { registerProbeRoutes } from "../../test-support/probe-routes.js";
import { app } from "../app.js";

// `/test/protected` is the route `requireSession` and `principalOf` are proven
// against, so nothing that exists only for a test ships.
registerProbeRoutes(app);

/**
 * Signing in, against the real database.
 *
 * A session that was deleted and an expiry that has passed are the database's
 * behaviour rather than the application's, so a test against a mock would be a
 * test of the mock.
 */

const runs = hasTestDatabase ? describe : describe.skip;

/** The account every test here signs in as. */
const ACCOUNT = { email: "author@layered.test", password: "a-password-nobody-guessed", name: "The Author" };

/** Pulls the session cookie out of a response, whatever else is on it. */
function sessionCookieFrom(response: Response): string | undefined {
  return response.headers.getSetCookie().find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));
}

/** The value alone, for sending back. */
function asRequestCookie(setCookie: string): string {
  return setCookie.split(";")[0] ?? "";
}

/** Signs in and returns everything a following request needs. */
async function signIn(password = ACCOUNT.password) {
  const response = await app.request("/auth/sign-in", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: ACCOUNT.email, password }),
  });
  const setCookie = sessionCookieFrom(response);
  return { response, setCookie, cookie: setCookie ? asRequestCookie(setCookie) : undefined };
}

runs("signing in", () => {
  let userId: string;

  beforeAll(async () => {
    await emptyTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  beforeEach(async () => {
    const database = await testDatabase();
    await emptyTestDatabase();
    const [created] = await database
      .insert(users)
      .values({
        email: ACCOUNT.email,
        passwordHash: await hashPassword(ACCOUNT.password),
        displayName: ACCOUNT.name,
        role: "owner",
      })
      .returning({ id: users.id });
    userId = created?.id ?? "";
  });

  it("answers with who signed in, and never with the hash", async () => {
    const { response } = await signIn();
    expect(response.status).toBe(200);

    const { data } = (await response.json()) as { data: SignedInAs };
    expect(data).toMatchObject({ email: ACCOUNT.email, displayName: ACCOUNT.name, role: "owner" });
    expect(JSON.stringify(data)).not.toMatch(/scrypt|passwordHash/);
  });

  it("sets a cookie that is httpOnly, same-site and scoped to the whole site", async () => {
    const { setCookie } = await signIn();
    expect(setCookie).toBeDefined();
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Path=\//i);
  });

  it("writes a session whose token is not in the table", async () => {
    const { setCookie } = await signIn();
    const value = asRequestCookie(setCookie ?? "").split("=")[1] ?? "";
    const token = value.split(".")[0] ?? "";

    const database = await testDatabase();
    const rows = await database.select({ tokenHash: sessions.tokenHash }).from(sessions);

    expect(rows).toHaveLength(1);
    expect(token.length).toBeGreaterThan(40);
    expect(rows[0]?.tokenHash).not.toBe(token);
    expect(rows[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses a wrong password", async () => {
    const { response } = await signIn("not-the-password");
    expect(response.status).toBe(401);
    expect(sessionCookieFrom(response)).toBeUndefined();
  });

  it("answers a wrong password and an unknown address identically", async () => {
    const wrongPassword = await signIn("not-the-password");
    const unknownAddress = await app.request("/auth/sign-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "nobody@layered.test", password: ACCOUNT.password }),
    });

    expect(wrongPassword.response.status).toBe(unknownAddress.status);

    const one = readApiError(await wrongPassword.response.json());
    const other = readApiError(await unknownAddress.json());
    expect(one?.code).toBe(other?.code);
    expect(one?.message).toBe(other?.message);
    // The id differs, which is the point of it, so it is not compared.
    expect(one?.id).not.toBe(other?.id);
  });

  it("takes comparably long either way", async () => {
    // Returning early on "no such account" skips the hashing, and the hashing
    // is the slow part, so the difference would say whether an address has an
    // account here to anybody with a stopwatch.
    const time = async (email: string) => {
      const started = performance.now();
      await app.request("/auth/sign-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password: "whatever-this-is-not" }),
      });
      return performance.now() - started;
    };

    const known: number[] = [];
    const unknown: number[] = [];
    for (let round = 0; round < 3; round += 1) {
      known.push(await time(ACCOUNT.email));
      unknown.push(await time("nobody@layered.test"));
    }

    const median = (values: number[]) => [...values].sort((a, b) => a - b)[1] ?? 0;
    const ratio = median(unknown) / median(known);

    // Generous, because a laptop under load is noisy. The failure being caught
    // is an early return, which makes one path tens of times faster.
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(2.5);
  });

  it("refuses an address that is not one, before anything runs", async () => {
    const response = await app.request("/auth/sign-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "not-an-address", password: ACCOUNT.password }),
    });
    expect(response.status).toBe(400);
  });

  it("signs in whatever case the address was typed in", async () => {
    const response = await app.request("/auth/sign-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: ACCOUNT.email.toUpperCase(), password: ACCOUNT.password }),
    });
    expect(response.status).toBe(200);
    expect(userId).not.toBe("");
  });
});

runs("a session", () => {
  beforeAll(async () => {
    await emptyTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  beforeEach(async () => {
    const database = await testDatabase();
    await emptyTestDatabase();
    await database.insert(users).values({
      email: ACCOUNT.email,
      passwordHash: await hashPassword(ACCOUNT.password),
      displayName: ACCOUNT.name,
      role: "owner",
    });
  });

  it("says who is signed in", async () => {
    const { cookie } = await signIn();
    const response = await app.request("/auth/me", { headers: { cookie: cookie ?? "" } });

    expect(response.status).toBe(200);
    const { data } = (await response.json()) as { data: SignedInAs | null };
    expect(data?.email).toBe(ACCOUNT.email);
  });

  it("says nobody when there is no cookie", async () => {
    const response = await app.request("/auth/me");
    expect(response.status).toBe(200);
    expect(((await response.json()) as { data: unknown }).data).toBeNull();
  });

  it("lets a signed-in request through a protected route", async () => {
    const { cookie } = await signIn();
    const response = await app.request("/test/protected", { headers: { cookie: cookie ?? "" } });
    expect(response.status).toBe(200);
  });

  it("refuses a protected route without one", async () => {
    const response = await app.request("/test/protected");
    expect(response.status).toBe(401);
    expect(readApiError(await response.json())?.code).toBe("unauthenticated");
  });

  it("stops working the moment its row is deleted", async () => {
    const { cookie } = await signIn();
    const database = await testDatabase();

    const before = await app.request("/test/protected", { headers: { cookie: cookie ?? "" } });
    expect(before.status).toBe(200);

    await database.delete(sessions);

    const after = await app.request("/test/protected", { headers: { cookie: cookie ?? "" } });
    expect(after.status).toBe(401);
  });

  it("stops working once it has expired, rather than being renewed", async () => {
    const { cookie } = await signIn();
    const database = await testDatabase();

    await database.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) });

    const response = await app.request("/test/protected", { headers: { cookie: cookie ?? "" } });
    expect(response.status).toBe(401);

    // Still there, so the refusal came from the expiry rather than from a row
    // that something tidied away.
    expect(await database.select({ id: sessions.id }).from(sessions)).toHaveLength(1);
  });

  it("is refused when the signature is not this server's", async () => {
    const { cookie } = await signIn();
    const [withName, signature] = (cookie ?? "").split(".");

    // One character, so the signature stays exactly as long as a real one. A
    // shorter forgery is refused by the length check instead, which would leave
    // the comparison itself untested.
    const flipped = `${signature?.[0] === "a" ? "b" : "a"}${signature?.slice(1)}`;

    const response = await app.request("/test/protected", {
      headers: { cookie: `${withName}.${flipped}` },
    });
    expect(response.status).toBe(401);
  });

  it("is refused when the signature is a different length", async () => {
    const { cookie } = await signIn();
    const response = await app.request("/test/protected", {
      headers: { cookie: `${(cookie ?? "").split(".")[0]}.short` },
    });
    expect(response.status).toBe(401);
  });

  it("is refused when the token is swapped for another", async () => {
    const { cookie } = await signIn();
    const [name, value] = (cookie ?? "").split("=");
    const signature = (value ?? "").split(".")[1] ?? "";

    const response = await app.request("/test/protected", {
      headers: { cookie: `${name}=a-token-that-was-never-issued.${signature}` },
    });
    expect(response.status).toBe(401);
  });
});

runs("signing out", () => {
  beforeAll(async () => {
    await emptyTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  beforeEach(async () => {
    const database = await testDatabase();
    await emptyTestDatabase();
    await database.insert(users).values({
      email: ACCOUNT.email,
      passwordHash: await hashPassword(ACCOUNT.password),
      displayName: ACCOUNT.name,
      role: "owner",
    });
  });

  it("deletes the row rather than only clearing the cookie", async () => {
    const { cookie } = await signIn();
    const database = await testDatabase();
    expect(await database.select({ id: sessions.id }).from(sessions)).toHaveLength(1);

    const response = await app.request("/auth/sign-out", {
      method: "POST",
      headers: { cookie: cookie ?? "" },
    });

    expect(response.status).toBe(200);
    expect(await database.select({ id: sessions.id }).from(sessions)).toHaveLength(0);
  });

  it("clears the cookie with the attributes it was set with", async () => {
    const { cookie } = await signIn();
    const response = await app.request("/auth/sign-out", {
      method: "POST",
      headers: { cookie: cookie ?? "" },
    });

    const cleared = sessionCookieFrom(response);
    expect(cleared).toBeDefined();
    // Cleared with different attributes is not cleared: the browser keeps the
    // original and the person is still signed in.
    expect(cleared).toMatch(/HttpOnly/i);
    expect(cleared).toMatch(/Path=\//i);
    expect(cleared).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  });

  it("leaves other sessions alone", async () => {
    const first = await signIn();
    const second = await signIn();
    const database = await testDatabase();
    expect(await database.select({ id: sessions.id }).from(sessions)).toHaveLength(2);

    await app.request("/auth/sign-out", { method: "POST", headers: { cookie: first.cookie ?? "" } });

    expect(await database.select({ id: sessions.id }).from(sessions)).toHaveLength(1);
    const still = await app.request("/test/protected", { headers: { cookie: second.cookie ?? "" } });
    expect(still.status).toBe(200);
  });

  it("answers the same when there was nothing to sign out of", async () => {
    const withSession = await signIn();
    const signedOut = await app.request("/auth/sign-out", {
      method: "POST",
      headers: { cookie: withSession.cookie ?? "" },
    });
    const never = await app.request("/auth/sign-out", { method: "POST" });

    expect(never.status).toBe(signedOut.status);
    expect(await never.json()).toEqual(await signedOut.json());
  });

  it("does not sign out the account that the deleted session belonged to", async () => {
    const { cookie } = await signIn();
    const database = await testDatabase();

    await app.request("/auth/sign-out", { method: "POST", headers: { cookie: cookie ?? "" } });

    const [account] = await database
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, ACCOUNT.email));
    expect(account).toBeDefined();
  });
});
