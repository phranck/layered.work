import {
  ACCEPTED_IMAGE_TYPES,
  binaryContent,
  completeUploadBody,
  createUploadBody,
  ErrorCode,
  focalPoint,
  mediaDetail,
  mediaLibraryPage,
  mediaLibraryQuery,
  mediaProcessing,
  saveMediaMetadataBody,
  updateMediaFocalBody,
  uploadedMedia,
  uploadReceived,
  uploadTicket,
  uploadToken,
} from "@layered/schemas";
import { Hono } from "hono";
import { z } from "zod";
import { database } from "../../db/connect.js";
import { logger } from "../../logger.js";
import { saveMediaFocalPoint } from "../../media/focal.js";
import { getMediaDetail, listMedia, saveMediaMetadata } from "../../media/library.js";
import { getMediaProcessing } from "../../media/processing.js";
import { storageMode, writeLocalMediaObject } from "../../media/storage.js";
import { completeUpload, createUpload } from "../../media/upload.js";
import { readUploadToken } from "../../media/upload-token.js";
import { acceptsRaw, responds } from "../api-metadata.js";
import { requireScope } from "../require-scope.js";
import { principalOf } from "../require-session.js";
import { HttpError, ok } from "../response.js";
import { validate } from "../validate.js";

/**
 * The media library's upload path: ask, send the bytes, say it is done.
 *
 * Every route here needs a session. The library is shared by everybody who may
 * write, so there is no owner to check beyond that, but the token records who
 * asked and only they may complete it.
 */
export const media = new Hono();

media.get(
  "/",
  requireScope("media:write"),
  validate("query", mediaLibraryQuery),
  responds(mediaLibraryPage),
  async (c) => ok(c, await listMedia(database(), c.req.valid("query"))),
);
media.get(
  "/:id",
  requireScope("media:write"),
  validate("param", z.object({ id: z.uuid() })),
  responds(mediaDetail),
  async (c) => ok(c, await getMediaDetail(database(), c.req.valid("param").id)),
);
media.put(
  "/:id",
  requireScope("media:write"),
  validate("param", z.object({ id: z.uuid() })),
  validate("json", saveMediaMetadataBody),
  responds(mediaDetail),
  async (c) =>
    ok(c, await saveMediaMetadata(database(), c.req.valid("param").id, c.req.valid("json"), principalOf(c))),
);

media.get(
  "/:id/processing",
  requireScope("media:write"),
  validate("param", z.object({ id: z.uuid() })),
  responds(mediaProcessing),
  async (c) => ok(c, await getMediaProcessing(database(), c.req.valid("param").id)),
);

media.patch(
  "/:id/focal-point",
  requireScope("media:write"),
  validate("param", z.object({ id: z.uuid() })),
  validate("json", updateMediaFocalBody),
  responds(focalPoint),
  async (c) =>
    ok(
      c,
      await saveMediaFocalPoint(database(), c.req.valid("param").id, c.req.valid("json"), principalOf(c)),
    ),
);

media.post(
  "/uploads",
  requireScope("media:write"),
  validate("json", createUploadBody),
  responds(uploadTicket),
  async (c) => ok(c, await createUpload(c.req.valid("json"), principalOf(c).userId)),
);

media.post(
  "/uploads/complete",
  requireScope("media:write"),
  validate("json", completeUploadBody),
  responds(uploadedMedia),
  async (c) =>
    ok(
      c,
      await completeUpload(
        database(),
        c.req.valid("json").token,
        principalOf(c).userId,
        principalOf(c).tokenId,
      ),
    ),
);

/**
 * Whether this process stores uploads itself rather than in a bucket.
 *
 * Read once, when the routes are registered, so the route below does not exist
 * at all on a deployment with a bucket, which is every production deployment.
 */
function storesLocally(): boolean {
  try {
    return storageMode().kind === "local";
  } catch {
    return false;
  }
}

/** The path the local upload route answers at, which the app's body limit leaves to this route. */
export const LOCAL_UPLOAD_CONTENT = /^\/media\/uploads\/[A-Za-z0-9_.-]+\/content$/;

if (storesLocally()) {
  /**
   * Receives an upload's bytes where a bucket would have, outside production.
   *
   * The token says which key, which type and how many bytes, so a body that is
   * larger or of another declared type is refused before or while it is read.
   */
  media.put(
    "/uploads/:token/content",
    requireScope("media:write"),
    validate("param", z.object({ token: uploadToken })),
    acceptsRaw(binaryContent, ACCEPTED_IMAGE_TYPES),
    responds(uploadReceived),
    async (c) => {
      const claims = readUploadToken(c.req.valid("param").token);
      if (!claims || claims.userId !== principalOf(c).userId) {
        throw new HttpError(ErrorCode.InvalidRequest, "This upload is not valid, or it has expired.");
      }
      if (c.req.header("content-type") !== claims.type) {
        throw new HttpError(
          ErrorCode.InvalidRequest,
          "The file was not sent as the type it was declared as.",
        );
      }
      const body = c.req.raw.body;
      if (!body) throw new HttpError(ErrorCode.InvalidRequest, "Nothing was sent.");

      const mode = storageMode();
      if (mode.kind !== "local") throw new HttpError(ErrorCode.NotFound, "There is nothing at this address.");
      try {
        const received = await writeLocalMediaObject(mode.root, claims.storageKey, body, claims.size);
        logger.info({ storageKey: claims.storageKey, bytes: received }, "upload received");
      } catch (cause) {
        throw new HttpError(
          ErrorCode.InvalidRequest,
          "The file could not be received as it was declared.",
          cause,
        );
      }
      c.header("Cache-Control", "no-store");
      return ok(c, { received: true });
    },
  );
}
