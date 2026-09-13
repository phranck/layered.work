import { ErrorCode } from "@layered/schemas";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { MAX_BODY_BYTES } from "../config.js";
import { logger } from "../logger.js";
import { health } from "./health.js";
import { requestId } from "./request-id.js";
import { fail, INTERNAL_MESSAGE, statusFor } from "./response.js";
import { auth } from "./routes/auth.js";

/**
 * The application, and the three things every request passes through whatever
 * route it reaches.
 *
 * The order is the point. The identifier comes first, so that anything failing
 * afterwards has one to be quoted by. The size limit comes before the body is
 * read, so an oversized request costs nothing. The log line is written last,
 * when the status and the duration are known.
 */

export const app = new Hono();

app.use("*", requestId);
app.use(
  "*",
  bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) => fail(c, ErrorCode.PayloadTooLarge, "The request body is too large."),
  }),
);

/**
 * One line per request, written after it is answered.
 *
 * The duration is measured here rather than taken from the platform, because
 * this is the part the application is responsible for. It carries no body, no
 * header and no query value: what a request was for is the route, and what went
 * wrong is the line the error handler wrote under the same id.
 */
app.use("*", async (c, next) => {
  const startedAt = performance.now();
  await next();
  logger.info(
    {
      requestId: c.get("requestId"),
      method: c.req.method,
      route: c.req.routePath,
      status: c.res.status,
      durationMs: Math.round(performance.now() - startedAt),
    },
    "request",
  );
});

app.route("/health", health);
app.route("/auth", auth);

/** An address that is not here, in the same shape as every other failure. */
app.notFound((c) => fail(c, ErrorCode.NotFound, "There is nothing at this address."));

/**
 * Everything that was thrown, turned into a response in one place.
 *
 * Three kinds arrive here and they are told apart on purpose. An `HttpError` is
 * a decision somebody made, and its message was written to be read. An
 * `HTTPException` is Hono refusing something before a handler ran. Anything
 * else is a fault: its message was not written for a caller and may carry a
 * query, a path or a connection string, so it is replaced and only the id is
 * shared.
 *
 * The severity follows the same split. An input error at `info` keeps the noisy
 * kind from burying the serious kind, which is the whole reason a log has
 * levels.
 */
app.onError((error, c) => {
  const requestId = c.get("requestId");

  if (error instanceof HTTPException) {
    logger.info(
      { requestId, code: ErrorCode.InvalidRequest, route: c.req.routePath, status: error.status },
      "request refused",
    );
    return fail(c, ErrorCode.InvalidRequest, "The request is not valid.");
  }

  if (isHttpError(error)) {
    const status = statusFor(error.code);
    logger[status >= 500 ? "error" : "info"](
      { requestId, code: error.code, route: c.req.routePath, status, err: error.cause ?? error },
      "request failed",
    );
    return fail(c, error.code, error.message);
  }

  logger.error(
    { requestId, code: ErrorCode.Internal, route: c.req.routePath, method: c.req.method, err: error },
    "unhandled error",
  );
  return fail(c, ErrorCode.Internal, INTERNAL_MESSAGE);
});

/**
 * Whether this is one of ours.
 *
 * By shape rather than by `instanceof`, which fails silently when two copies of
 * a module end up loaded and turns every deliberate failure into a 500.
 */
function isHttpError(error: unknown): error is { code: ErrorCode; message: string; cause?: unknown } {
  return (
    error instanceof Error &&
    error.name === "HttpError" &&
    "code" in error &&
    Object.values(ErrorCode).includes((error as { code: ErrorCode }).code)
  );
}
