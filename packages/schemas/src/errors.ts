import { z } from "zod";

/**
 * The one shape every failure arrives in, and the codes it may carry.
 *
 * This lives here rather than in the backend because the dashboard reads it.
 * A screen that wants to say "that address is already taken" has to recognise
 * the failure, and matching on a message means the wording of a sentence is
 * load-bearing: translating it, or making it friendlier, breaks the screen.
 * The code is what it matches on, and the message is free to change.
 *
 * **The codes are an interface and do not change once they are published.**
 * A new kind of failure gets a new code. Renaming one breaks whatever was
 * matching on it, silently, because the new name simply never matches.
 */

/**
 * Why a request failed, in a word the caller can branch on.
 *
 * Deliberately few. A code exists so a caller can do something different, and
 * where the only sensible response is to show the message, a more specific code
 * buys nothing and has to be kept for ever.
 */
export const ErrorCode = {
  /** The request did not match the route's schema. Nothing ran. */
  InvalidRequest: "invalid_request",
  /** No session and no token, where one is required. */
  Unauthenticated: "unauthenticated",
  /** Authenticated, and not allowed to do this. */
  Forbidden: "forbidden",
  /** The address or the record is not there. */
  NotFound: "not_found",
  /** The request is well formed but conflicts with what is already stored. */
  Conflict: "conflict",
  /** The body is larger than this API accepts. */
  PayloadTooLarge: "payload_too_large",
  /** Too many requests from this caller. */
  RateLimited: "rate_limited",
  /** Something went wrong here, and the cause is in the log line with this id. */
  Internal: "internal",
} as const;

/** One of the codes above. */
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Every code, for a schema or an exhaustiveness check. */
export const ERROR_CODES = Object.values(ErrorCode) as [ErrorCode, ...ErrorCode[]];

/**
 * The body of every failed response.
 *
 * `id` is the request id, the same value the response carries in its
 * `X-Request-Id` header and the value the log line for this request is written
 * under. One identifier rather than two: a request produces at most one failure,
 * so a separate error id would be a second name for the same thing, and the
 * person quoting it would have to be told which of the two to quote.
 *
 * `message` is safe to put in front of a person. It never carries a stack, a
 * query, an upstream body or a configuration value, which is enforced where the
 * response is built rather than trusted to each handler.
 */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    id: z.string(),
  }),
});

/** What a caller receives when something failed. */
export type ApiError = z.infer<typeof apiErrorSchema>;

/**
 * Reads a failed response, or says it was not one.
 *
 * Every caller needs this and none of them should write it, because a response
 * that is not in this shape is exactly the case worth noticing: it means
 * something between the caller and the API answered instead, such as a gateway
 * or a proxy.
 *
 * @param body - Whatever came back, already parsed from JSON.
 * @returns The failure, or null when the body is not one.
 */
export function readApiError(body: unknown): ApiError["error"] | null {
  const parsed = apiErrorSchema.safeParse(body);
  return parsed.success ? parsed.data.error : null;
}
