import { accountProfile, binaryContent, ErrorCode, idParam, updateAccountBody } from "@layered/schemas";
import { Hono } from "hono";
import { getAccountMediaObject, getAccountProfile, updateAccountProfile } from "../../account/repository.js";
import { observeMediaStream } from "../../account/stream.js";
import { database } from "../../db/connect.js";
import { isUniqueViolation } from "../../db/unique-violation.js";
import { logger } from "../../logger.js";
import { readMediaObject } from "../../media/storage.js";
import { responds } from "../api-metadata.js";
import { principalOf, requireSession } from "../require-session.js";
import { HttpError, ok } from "../response.js";
import { validate } from "../validate.js";

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
