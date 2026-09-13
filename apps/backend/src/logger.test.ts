import pino from "pino";
import { describe, expect, it, vi } from "vitest";
import { deviation, logger, loggerOptions } from "./logger.js";

/**
 * What must never reach a log line, checked against the real redaction list.
 *
 * The logger the service uses writes to stdout at a level the suite silences,
 * so these build a second one over a capture stream from the same options. The
 * list being tested is therefore the one that ships, not a copy of it in the
 * test, which would only prove that the copy is correct.
 */

/** A logger that keeps what it wrote. */
function capturing() {
  const lines: string[] = [];
  const logger = pino({ ...loggerOptions, level: "info" }, { write: (line) => void lines.push(line) });
  return { logger, written: () => lines.join("") };
}

/** A value that would be catastrophic in a shared log viewer. */
const SECRET = "s3cr3t-value-nobody-should-ever-see";

describe("redaction", () => {
  it("drops a credential wherever in the object it appears", () => {
    const { logger, written } = capturing();

    logger.info({ password: SECRET }, "top level");
    logger.info({ user: { passwordHash: SECRET } }, "one level down");
    logger.info({ session: { agent: { token: SECRET } } }, "two levels down");

    expect(written()).not.toContain(SECRET);
  });

  it("drops the headers that are themselves the credential", () => {
    const { logger, written } = capturing();

    logger.info(
      {
        req: {
          method: "GET",
          url: "/",
          headers: { authorization: `Bearer ${SECRET}`, cookie: `session=${SECRET}` },
        },
      },
      "a request",
    );

    expect(written()).not.toContain(SECRET);
  });

  it("drops a connection string, which arrives inside somebody else's error", () => {
    const { logger, written } = capturing();

    logger.error({ DATABASE_URL: `postgres://app:${SECRET}@db:5432/app` }, "configuration");
    logger.error({ connectionString: `postgres://app:${SECRET}@db:5432/app` }, "a driver");

    expect(written()).not.toContain(SECRET);
  });

  it("removes the property rather than replacing it", () => {
    // A placeholder would still say that a token was there. Where the question
    // is whether something leaked, the absence of the key is the answer.
    const { logger, written } = capturing();

    logger.info({ token: SECRET, route: "/entries" }, "a request");

    expect(written()).not.toContain("token");
    expect(written()).toContain("/entries");
  });

  it("drops the password out of an address inside an error", () => {
    // The one a property-name list cannot reach. A driver reports what it tried
    // to connect to, and what it tried to connect to carries the password.
    const { logger, written } = capturing();

    logger.error(
      { err: new Error(`connect ECONNREFUSED postgres://app:${SECRET}@db:5432/app`) },
      "the database did not answer",
    );

    const line = written();
    expect(line).not.toContain(SECRET);
    // What is left still says which host and which database, which is the part
    // worth having.
    expect(line).toContain("postgres://redacted@db:5432/app");
  });

  it("leaves everything that is not a credential alone", () => {
    const { logger, written } = capturing();

    logger.info({ requestId: "abc", route: "/entries/:slug", status: 404, durationMs: 3 }, "request");

    const line = written();
    expect(line).toContain("abc");
    expect(line).toContain("/entries/:slug");
    expect(line).toContain("404");
  });
});

describe("a deviation", () => {
  it("is marked, so a fallback that fires constantly does not read as normal", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});

    deviation("no variant at that width", { fellBackTo: "the original image" });

    expect(warn).toHaveBeenCalledWith(
      { deviation: true, fellBackTo: "the original image" },
      "no variant at that width",
    );
    warn.mockRestore();
  });

  it("goes out at warn, above the level a request line uses", () => {
    // Below `warn` it would be filtered out wherever the level is raised, which
    // is exactly where somebody is looking for it.
    const { logger: capture, written } = capturing();
    capture.warn({ deviation: true }, "something fell back");

    expect(JSON.parse(written()).level).toBe(40);
  });
});
