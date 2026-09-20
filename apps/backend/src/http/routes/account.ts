import { accountMediaQuery, ErrorCode, updateAccountBody } from "@layered/schemas";
import { Hono } from "hono";
import { z } from "zod";
import {
  getAccountMediaObject,
  getAccountProfile,
  listAccountMedia,
  updateAccountProfile,
} from "../../account/repository.js";
import { readAccountMediaObject } from "../../account/storage.js";
import { observeMediaStream } from "../../account/stream.js";
import { database } from "../../db/connect.js";
import { logger } from "../../logger.js";
import { principalOf, requireSession } from "../require-session.js";
import { HttpError, ok } from "../response.js";
import { validate } from "../validate.js";

const mediaIdParam = z.object({ id: z.uuid() });

/** The signed-in author's profile and portrait-library endpoints. */
export const account = new Hono();

account.use("*", requireSession);

account.get("/", async (c) => ok(c, await getAccountProfile(database(), principalOf(c).userId)));

account.patch("/", validate("json", updateAccountBody), async (c) => {
  try {
    return ok(c, await updateAccountProfile(database(), principalOf(c).userId, c.req.valid("json")));
  } catch (error) {
    if (isEmailConflict(error)) {
      throw new HttpError(ErrorCode.Conflict, "That email address is already used by another account.");
    }
    throw error;
  }
});

account.get("/media", validate("query", accountMediaQuery), async (c) =>
  ok(c, await listAccountMedia(database(), c.req.valid("query"))),
);

account.get("/media/:id/content", validate("param", mediaIdParam), async (c) => {
  const object = await getAccountMediaObject(database(), c.req.valid("param").id);
  const source = await readAccountMediaObject(object.storageKey);
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
});

function isEmailConflict(error: unknown): boolean {
  const seen = new Set<unknown>();
  let candidate = error;
  for (let depth = 0; depth < 5 && typeof candidate === "object" && candidate !== null; depth += 1) {
    if (seen.has(candidate)) return false;
    seen.add(candidate);
    if (
      "code" in candidate &&
      candidate.code === "23505" &&
      "constraint_name" in candidate &&
      candidate.constraint_name === "users_email_unique"
    ) {
      return true;
    }
    candidate = "cause" in candidate ? candidate.cause : undefined;
  }
  return false;
}
