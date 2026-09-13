import { describe, expect, it } from "vitest";
import { readConfig } from "./config.js";

/**
 * What has to hold about the environment before the port opens.
 *
 * These are checked against `readConfig` rather than against a running process
 * because the value the process uses is read at import time, which is the point:
 * a service that cannot be configured must fail whilst starting.
 */

/** Enough of an environment to be valid, which each test then breaks in one way. */
const workable = {
  DATABASE_URL: "postgres://nobody@127.0.0.1:1/nothing",
  SITE_ORIGIN: "http://localhost:3002",
  DASHBOARD_ORIGIN: "http://localhost:4502",
};

describe("readConfig", () => {
  it("refuses production without a session secret, and names the variable", () => {
    expect(() => readConfig({ ...workable, NODE_ENV: "production" })).toThrowError(/SESSION_SECRET/);
  });

  it("accepts production once the secret is long enough", () => {
    const config = readConfig({
      ...workable,
      NODE_ENV: "production",
      SESSION_SECRET: "x".repeat(32),
    });
    expect(config.NODE_ENV).toBe("production");
  });

  it("refuses a session secret that is somebody's password rather than a generated value", () => {
    expect(() => readConfig({ ...workable, NODE_ENV: "production", SESSION_SECRET: "hunter2" })).toThrowError(
      /SESSION_SECRET/,
    );
  });

  it("reads an empty value as absent, which is how an .env file says nothing", () => {
    // .env.example ships every secret empty on purpose, so a fresh checkout has
    // SESSION_SECRET= in the file. Present and empty has to mean the same thing
    // as absent, or a copied template reads as a misconfiguration.
    const config = readConfig({ ...workable, SESSION_SECRET: "", S3_BUCKET: "" });
    expect(config.SESSION_SECRET).toBeUndefined();
    expect(config.S3_BUCKET).toBeUndefined();
  });

  it("refuses a missing database address rather than falling back to anything", () => {
    const { DATABASE_URL, ...withoutDatabase } = workable;
    expect(DATABASE_URL).toBeTypeOf("string");
    expect(() => readConfig(withoutDatabase)).toThrowError(/DATABASE_URL/);
  });

  it("refuses an origin that is not an address", () => {
    expect(() => readConfig({ ...workable, SITE_ORIGIN: "layered.work" })).toThrowError(/SITE_ORIGIN/);
  });

  it("names every fault at once rather than the first", () => {
    const message = (() => {
      try {
        readConfig({ NODE_ENV: "production" });
        return "";
      } catch (error) {
        return (error as Error).message;
      }
    })();

    expect(message).toMatch(/DATABASE_URL/);
    expect(message).toMatch(/SITE_ORIGIN/);
    expect(message).toMatch(/DASHBOARD_ORIGIN/);
    expect(message).toMatch(/SESSION_SECRET/);
  });

  it("never prints a value it refused", () => {
    const secret = "a-secret-that-must-not-appear";
    const message = (() => {
      try {
        readConfig({ ...workable, SITE_ORIGIN: secret });
        return "";
      } catch (error) {
        return (error as Error).message;
      }
    })();

    expect(message).toMatch(/SITE_ORIGIN/);
    expect(message).not.toContain(secret);
  });
});
