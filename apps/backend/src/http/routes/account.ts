import {
  accountProfile,
  binaryContent,
  changePasswordBody,
  ErrorCode,
  idParam,
  passwordChanged,
  updateAccountBody,
} from "@layered/schemas";
import { Hono } from "hono";
import { changeAccountPassword } from "../../account/password.js";
import { getAccountMediaObject, getAccountProfile, updateAccountProfile } from "../../account/repository.js";
import { observeMediaStream } from "../../account/stream.js";
import { database } from "../../db/connect.js";
import { isUniqueViolation } from "../../db/unique-violation.js";
import { logger } from "../../logger.js";
import { readMediaObject } from "../../media/storage.js";
import { responds } from "../api-metadata.js";
import { byAddress, rateLimit } from "../rate-limit.js";
import { principalOf, requireSession } from "../require-session.js";
import { HttpError, ok } from "../response.js";
import { validate } from "../validate.js";
import { SIGN_IN_PER_ACCOUNT, SIGN_IN_PER_ADDRESS } from "./auth.js";

/** The signed-in author's profile, and the library pictures the dashboard reads through it. */
export const account = new Hono();

account.use("*", requireSession);

account.get("/", responds(accountProfile), async (c) =>
  ok(c, await getAccountProfile(database(), principalOf(c).userId)),
);

account.patch("/", validate("json", updateAccountBody), responds(accountProfile), async (c) => {
  try {
    return ok(c, await updateAccountProfile(database(), principalOf(c).userId, c.req.valid("json")));
  } catch (error) {
    if (isUniqueViolation(error, "users_email_unique")) {
      throw new HttpError(ErrorCode.Conflict, "That email address is already used by another account.");
    }
    throw error;
  }
});

/**
 * Changing the password is a guess at the password in use, so it is limited as
 * signing in is, with buckets of its own: per source address before the body is
 * read, and per account, which the session names.
 */
const PASSWORD_PER_ADDRESS = { ...SIGN_IN_PER_ADDRESS, name: "password-change-address" };
const PASSWORD_PER_ACCOUNT = { ...SIGN_IN_PER_ACCOUNT, name: "password-change-account" };

account.post(
  "/password",
  rateLimit({ ...PASSWORD_PER_ADDRESS, keys: (c) => [byAddress(c)] }),
  rateLimit({ ...PASSWORD_PER_ACCOUNT, keys: (c) => [`user:${principalOf(c).userId}`] }),
  validate("json", changePasswordBody),
  responds(passwordChanged),
  async (c) => {
    const principal = principalOf(c);
    const context = { requestId: c.get("requestId"), userId: principal.userId, route: c.req.routePath };
    // `requireSession` only ever sets a session, but the principal's type also
    // admits an access token, which must never be able to change a password.
    if (!("sessionId" in principal) || !principal.sessionId) {
      throw new HttpError(ErrorCode.Forbidden, "Only a signed-in browser can change the password.");
    }
    try {
      const changed = await changeAccountPassword(
        database(),
        principal.userId,
        principal.sessionId,
        c.req.valid("json"),
      );
      logger.info({ ...context, otherSessionsEnded: changed.otherSessionsEnded }, "password changed");
      return ok(c, changed);
    } catch (error) {
      if (error instanceof HttpError && error.code === ErrorCode.Forbidden) {
        logger.info(
          { ...context, code: ErrorCode.Forbidden },
          "password change refused: wrong current password",
        );
      }
      throw error;
    }
  },
);

account.get(
  "/media/:id/content",
  validate("param", idParam),
  responds(binaryContent, { envelope: false, mediaType: "application/octet-stream" }),
  async (c) => {
    const object = await getAccountMediaObject(database(), c.req.valid("param").id);
    if (object.hotlink) {
      c.header("Cache-Control", "private, no-store");
      return c.redirect(object.hotlink, 302);
    }
    const source = await readMediaObject(object.storageKey);
    const requestId = c.get("requestId");
    const stream = observeMediaStream(source, (error) => {
      logger.error(
        {
          requestId,
          errorId: requestId,
          code: ErrorCode.Internal,
          route: c.req.routePath,
          status: 200,
          result: "stream_failed",
          err: error,
        },
        "account media stream failed",
      );
    });
    c.header("Content-Type", object.mimeType);
    c.header("Cache-Control", "private, no-store");
    c.header("Cross-Origin-Resource-Policy", "same-origin");
    return c.body(stream);
  },
);
