import { body, ErrorCode, MaxLength, text } from "@layered/schemas";
import type { Hono } from "hono";
import { principalOf, requireSession } from "../http/require-session.js";
import { HttpError, ok } from "../http/response.js";
import { validate } from "../http/validate.js";

/**
 * Routes that exist to fail in a particular way, for the suite to aim at.
 *
 * They are registered on the real application rather than on one assembled for
 * the test, because what is being checked is the middleware chain, the
 * validator and the error handler as they actually run. A second application
 * built in a test file proves that the second application works.
 *
 * This folder is excluded from the build, so none of it ships.
 *
 * Vitest gives each test file its own module registry, so every file that wants
 * these has to register them itself. That is also why they cannot simply live
 * in one test file and be relied upon from another.
 */

/** The message the unexpected failure throws, carrying exactly what must never escape. */
export const LEAKY_MESSAGE = "a query failed against postgres://someone:hunter2@db:5432/app";

/** What the deliberate failure says, which is written to be read by a person. */
export const DELIBERATE_MESSAGE = "That slug is already taken.";

/**
 * Adds them to an application.
 *
 * @param app - The application under test.
 * @param onValidated - Called when the validated route's handler runs, so a
 *   test can assert that it did not.
 */
export function registerProbeRoutes(app: Hono, onValidated: () => void = () => {}) {
  app.post("/test/validated", validate("json", body({ title: text(MaxLength.Line) })), (c) => {
    onValidated();
    return ok(c, "the handler ran");
  });

  app.get("/test/throws-unexpectedly", () => {
    // The shape of the accident being guarded against: nobody writes a secret
    // into an error on purpose, a driver does.
    throw new Error(LEAKY_MESSAGE);
  });

  app.get("/test/throws-deliberately", () => {
    throw new HttpError(ErrorCode.Conflict, DELIBERATE_MESSAGE);
  });

  // A protected route, so that `requireSession` and `principalOf` are exercised
  // by something rather than only declared. The first feature route that needs
  // a signed-in person uses the same two.
  app.get("/test/protected", requireSession, (c) => ok(c, principalOf(c)));
}
