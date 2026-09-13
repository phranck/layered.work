import { API_POLICY, dashboardPolicy, sitePolicy } from "@layered/policy";
import { describe, expect, it } from "vitest";
import { registerProbeRoutes } from "../test-support/probe-routes.js";
import { app } from "./app.js";

registerProbeRoutes(app);

import { ALLOWED_ORIGINS } from "./headers.js";

/**
 * What leaves this service on every response, and who is allowed to ask.
 *
 * Asked of the real application so that the answer covers every route,
 * including the ones that fail, which are exactly the responses somebody could
 * otherwise point a browser at.
 */

/** The four the issue asks every host to send. */
const REQUIRED = ["content-security-policy", "referrer-policy", "x-content-type-options", "x-frame-options"];

describe("every response", () => {
  it.each([
    ["a route that exists", "/health"],
    ["a route that does not", "/nothing-here"],
    ["a route that fails", "/test/throws-unexpectedly"],
  ])("carries all four on %s", async (_what, path) => {
    const response = await app.request(path);
    for (const header of REQUIRED) {
      expect(response.headers.get(header), header).not.toBeNull();
    }
  });

  it("denies framing in both the old header and the policy", async () => {
    const response = await app.request("/health");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });

  it("permits nothing, because this service renders nothing", async () => {
    const policy = (await app.request("/health")).headers.get("content-security-policy");
    expect(policy).toContain("default-src 'none'");
    expect(policy).not.toContain("unsafe-inline");
    expect(policy).not.toContain("unsafe-eval");
  });

  it("turns off the browser capabilities nothing here uses", async () => {
    const permissions = (await app.request("/health")).headers.get("permissions-policy");
    expect(permissions).toContain("camera=()");
    expect(permissions).toContain("geolocation=()");
    expect(permissions).toContain("payment=()");
  });
});

describe("who may call this from a browser", () => {
  it("answers to the two interfaces", async () => {
    for (const origin of ALLOWED_ORIGINS) {
      const response = await app.request("/health", { headers: { origin } });
      expect(response.headers.get("access-control-allow-origin")).toBe(origin);
      expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    }
  });

  it("refuses an origin that is not on the list", async () => {
    const response = await app.request("/health", {
      headers: { origin: "https://not-this-site.invalid" },
    });
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("never reflects the origin it was sent", async () => {
    // Reflecting with credentials permitted is the same as allowing everybody,
    // written in a way that looks careful.
    const hostile = "https://layered.work.attacker.invalid";
    const response = await app.request("/health", { headers: { origin: hostile } });
    expect(response.headers.get("access-control-allow-origin")).not.toBe(hostile);
  });

  it("says the answer depends on the origin, so a cache cannot mix two callers up", async () => {
    const response = await app.request("/health", { headers: { origin: ALLOWED_ORIGINS[0] ?? "" } });
    expect(response.headers.get("vary")?.toLowerCase()).toContain("origin");
  });

  it("answers a preflight for the dashboard", async () => {
    const response = await app.request("/auth/sign-in", {
      method: "OPTIONS",
      headers: {
        origin: ALLOWED_ORIGINS[1] ?? "",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });

    expect(response.status).toBeLessThan(300);
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
  });
});

/**
 * The policies the other two hosts send.
 *
 * Tested from here because this is where the suite runs today, and the package
 * they come from has no runner of its own. They move when the website and the
 * dashboard get suites.
 *
 * What is checked is what can be wrong: that a nonce reaches both places a
 * nonce has to reach, and that nothing anywhere permits the two keywords that
 * make a policy decorative. The lists of permitted origins are decisions rather
 * than defects, and pinning them would fire every time one changes.
 */
describe("the policies the other hosts send", () => {
  it("puts the site's nonce on the scripts and on the style element", () => {
    const policy = sitePolicy("abc123");
    expect(policy).toContain("script-src 'self' 'nonce-abc123'");
    expect(policy).toContain("style-src-elem 'self' 'nonce-abc123'");
  });

  it("never permits an inline script anywhere", () => {
    // A nonce in a directive makes `unsafe-inline` ignored, so the two together
    // would read as careful and behave as neither.
    for (const policy of [API_POLICY, sitePolicy("abc123"), dashboardPolicy("https://api.example")]) {
      const scriptSrc = policy.split("; ").find((directive) => directive.startsWith("script-src"));
      expect(scriptSrc ?? "").not.toContain("unsafe-inline");
      expect(policy).not.toContain("unsafe-eval");
    }
  });

  it("denies framing on all three, since nothing here is meant to be framed", () => {
    for (const policy of [API_POLICY, sitePolicy("abc123"), dashboardPolicy("https://api.example")]) {
      expect(policy).toContain("frame-ancestors 'none'");
    }
  });

  it("starts every one of them from nothing", () => {
    for (const policy of [API_POLICY, sitePolicy("abc123"), dashboardPolicy("https://api.example")]) {
      expect(policy.startsWith("default-src 'none'")).toBe(true);
    }
  });

  it("lets the dashboard reach the API it is given and nowhere else unnamed", () => {
    const policy = dashboardPolicy("https://api.example");
    const connect = policy.split("; ").find((directive) => directive.startsWith("connect-src")) ?? "";
    expect(connect).toContain("https://api.example");
    expect(connect).not.toContain("*");
  });
});
