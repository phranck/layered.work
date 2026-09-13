import { zValidator } from "@hono/zod-validator";
import { ErrorCode } from "@layered/schemas";
import type { ValidationTargets } from "hono";
import type { ZodType } from "zod";
import { logger } from "../logger.js";
import { fail } from "./response.js";

/**
 * Checks a part of a request against its schema before the handler exists.
 *
 * **Use this rather than `zValidator` itself.** Called without a handler,
 * `zValidator` answers with the validation library's own error object, which
 * names the library, every expected field and every constraint it failed. On a
 * public route that is a description of the request somebody should send
 * instead, and it is a second error shape beside the one the rest of the API
 * uses, so a caller would have to understand both.
 *
 * What was actually wrong goes to the log under the request id, so a report
 * about a refused request can still be traced without publishing the schema.
 */

/** The one thing a caller is told about a request that did not fit. */
const REFUSED = "The request is not valid.";

/**
 * @typeParam Target - Which part to read: `json`, `query`, `param`, `header`, `form` or `cookie`.
 * @typeParam Schema - What that part has to satisfy.
 * @param target - The part of the request to check.
 * @param schema - The shape it has to have. Bodies are declared with `body()`
 *   from `@layered/schemas`, which refuses unknown properties.
 * @returns Middleware that either stores the parsed value or answers 400.
 */
export function validate<Target extends keyof ValidationTargets, Schema extends ZodType>(
  target: Target,
  schema: Schema,
) {
  return zValidator(target, schema, (result, c) => {
    if (result.success) return;

    // An input error, not a fault. At info, so the noisy kind cannot bury the
    // serious kind, and with the issues, which say which field and why.
    logger.info(
      {
        requestId: c.get("requestId"),
        code: ErrorCode.InvalidRequest,
        route: c.req.routePath,
        method: c.req.method,
        target,
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          code: issue.code,
        })),
      },
      "request refused by validation",
    );

    return fail(c, ErrorCode.InvalidRequest, REFUSED);
  });
}
