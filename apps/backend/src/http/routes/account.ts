import {
  accountMediaPage,
  accountMediaQuery,
  accountProfile,
  binaryContent,
  ErrorCode,
  updateAccountBody,
} from "@layered/schemas";
import { Hono } from "hono";
import { z } from "zod";
import {
  getAccountMediaObject,
  getAccountProfile,
  listAccountMedia,
  updateAccountProfile,
} from "../../account/repository.js";
import { observeMediaStream } from "../../account/stream.js";
import { database } from "../../db/connect.js";
import { isUniqueViolation } from "../../db/unique-violation.js";
import { logger } from "../../logger.js";
import { readMediaObject } from "../../media/storage.js";
import { responds } from "../api-metadata.js";
import { principalOf, requireSession } from "../require-session.js";
import { HttpError, ok } from "../response.js";
import { validate } from "../validate.js";

const mediaIdParam = z.object({ id: z.uuid() });

/** The signed-in author's profile and portrait-library endpoints. */
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

account.get("/media", validate("query", accountMediaQuery), responds(accountMediaPage), async (c) =>
  ok(c, await listAccountMedia(database(), c.req.valid("query"))),
);

account.get(
  "/media/:id/content",
  validate("param", mediaIdParam),
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
