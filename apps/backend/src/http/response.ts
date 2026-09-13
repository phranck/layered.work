import { type ApiError, ErrorCode } from "@layered/schemas";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * How every response leaves this API, success and failure alike.
 *
 * **The code decides the status.** They are one to one, so taking both would be
 * two answers to one question and would let a handler return 200 with a failure
 * in the body, or 500 with `not_found`. One argument, one map, and neither can
 * drift from the other.
 *
 * **Nothing a handler throws reaches the caller.** A message is written here or
 * it is the generic one, which is what keeps a stack, a query, an upstream body
 * or a connection string out of a response without every handler having to
 * remember.
 */

/** What each code answers with. */
const STATUS: Record<ErrorCode, ContentfulStatusCode> = {
  [ErrorCode.InvalidRequest]: 400,
  [ErrorCode.Unauthenticated]: 401,
  [ErrorCode.Forbidden]: 403,
  [ErrorCode.NotFound]: 404,
  [ErrorCode.Conflict]: 409,
  [ErrorCode.PayloadTooLarge]: 413,
  [ErrorCode.RateLimited]: 429,
  [ErrorCode.Internal]: 500,
};

/**
 * What a caller is told when something went wrong here.
 *
 * Deliberately says nothing. The cause is in the log line written under the same
 * id the response carries, which is where somebody with access to the logs can
 * read it and nobody else can.
 */
export const INTERNAL_MESSAGE = "Something went wrong. Quote the id if you report this.";

/** The status a code answers with, for anything that needs to know before responding. */
export function statusFor(code: ErrorCode): ContentfulStatusCode {
  return STATUS[code];
}

/**
 * A failure with a code, thrown from anywhere and turned into a response in one
 * place.
 *
 * Thrown rather than returned so that a check can sit in a helper several calls
 * deep without every caller in between having to pass a failure back up. The
 * handler that forgets to check is the failure mode this is shaped against.
 */
export class HttpError extends Error {
  /**
   * @param code - Why it failed, which decides the status.
   * @param message - Safe to show a person. Never built from an internal value.
   * @param cause - What actually happened, for the log and never for the response.
   */
  constructor(
    readonly code: ErrorCode,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/**
 * Answers with something.
 *
 * @param c - The request.
 * @param data - What to send, under `data`, so a success and a failure are told
 *   apart by shape rather than by guessing at the status.
 * @param status - Defaults to 200.
 */
export function ok<T>(c: Context, data: T, status: ContentfulStatusCode = 200) {
  return c.json({ data }, status);
}

/**
 * Answers with a failure, in the one shape.
 *
 * @param c - The request, which carries the id this failure is quoted by.
 * @param code - Why it failed.
 * @param message - Safe to show a person.
 */
export function fail(c: Context, code: ErrorCode, message: string) {
  const body: ApiError = {
    error: { code, message, id: c.get("requestId") },
  };
  return c.json(body, STATUS[code]);
}
