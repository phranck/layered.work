import pino from "pino";
import { config, isProduction } from "./config.js";

/**
 * One logger, configured once, redacting at the point of logging.
 *
 * **Redaction is designed in rather than added later**, because the first leak
 * is already permanent in whatever received it. Deleting the line from a log
 * store does not delete it from the copy that was shipped elsewhere, and the
 * value has to be rotated either way.
 *
 * The list below is deliberately shaped as wildcards over property names rather
 * than as exact paths. An exact path protects the one object somebody thought
 * of; a wildcard protects the object that gets logged next year by somebody who
 * did not read this file.
 */

/**
 * Property names that never appear in a log line, wherever they occur.
 *
 * `remove: true` rather than a placeholder, so a line cannot say that a token
 * was present and how long it was.
 */
const NEVER_LOGGED = [
  "password",
  "passwordHash",
  "token",
  "tokenHash",
  "accessToken",
  "sessionToken",
  "secret",
  "sessionSecret",
  "connectionString",
  "DATABASE_URL",
  "SESSION_SECRET",
  "S3_SECRET_ACCESS_KEY",
  "SMTP2GO_API_KEY",
];

/**
 * The paths pino redacts: every name above at the top level, one level down,
 * and anywhere under a request or a response.
 *
 * Written as a product rather than as a list, because a list of sixty paths is
 * a list nobody extends correctly.
 */
const redactPaths = [
  ...NEVER_LOGGED,
  ...NEVER_LOGGED.map((name) => `*.${name}`),
  ...NEVER_LOGGED.map((name) => `*.*.${name}`),
  // Whole headers rather than names inside them: an Authorization header is
  // the credential, and a Cookie header carries the session.
  "req.headers.authorization",
  "req.headers.cookie",
  "res.headers['set-cookie']",
  "headers.authorization",
  "headers.cookie",
];

/**
 * A password inside an address, which is the one secret redaction by property
 * name cannot reach.
 *
 * Nobody writes a credential into an error deliberately. A driver does: a
 * failed connection reports what it tried to connect to, and what it tried to
 * connect to is `postgres://role:password@host/database`. That string is inside
 * `err.message`, so no path in the list above sees it.
 */
const CREDENTIAL_IN_URL = /([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi;

/** Replaces the credential part of any address in a string. */
function withoutCredentials(text: string): string {
  return text.replace(CREDENTIAL_IN_URL, "$1redacted@");
}

/**
 * How every logger in this service is configured.
 *
 * Exported so that the suite can build one over a capture stream and check the
 * real redaction list rather than a copy of it. A test that asserts against its
 * own list proves that the list it wrote is correct.
 */
export const loggerOptions: pino.LoggerOptions = {
  level: config.LOG_LEVEL,
  redact: { paths: redactPaths, remove: true },
  serializers: {
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
    err: (error: Error) => {
      const serialized = pino.stdSerializers.err(error);
      return {
        ...serialized,
        message: withoutCredentials(serialized.message ?? ""),
        stack: serialized.stack ? withoutCredentials(serialized.stack) : serialized.stack,
      };
    },
  },
};

/**
 * The application's logger.
 *
 * JSON in production, because that is what a log store reads. Readable locally,
 * through pino-pretty attached as a stream rather than through pino's worker
 * transport, which is a devDependency and therefore absent from the production
 * image: importing it there would be a crash at boot.
 */
export const logger: pino.Logger = isProduction
  ? pino(loggerOptions)
  : pino(loggerOptions, (await import("pino-pretty")).default({ colorize: true, singleLine: false }));

/**
 * Something that went wrong and was handled, recorded as a deviation rather
 * than as normal operation.
 *
 * A fallback that fires constantly and logs nothing looks exactly like a system
 * that never fails, right up until the fallback itself fails and nobody has a
 * reason to have been watching. The marker is what lets a query count them.
 *
 * @param what - What deviated, in a few words.
 * @param detail - Whatever is worth knowing. Anything in the redaction list
 *   above is dropped on the way out, so this cannot leak a credential by
 *   accident.
 */
export function deviation(what: string, detail: Record<string, unknown> = {}): void {
  logger.warn({ ...detail, deviation: true }, what);
}
