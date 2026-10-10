import {
  ACCEPTED_IMAGE_TYPES,
  type AcceptedImageType,
  MAX_UPLOAD_BYTES,
  SLUG_MAX_LENGTH,
  SLUG_PATTERN,
} from "@layered/schemas";
import { z } from "zod";
import { claimsToken } from "../auth/signature.js";

/**
 * The token an upload is carried by, from the request that asked for it to the
 * one that says it is done.
 *
 * It holds everything the server decided when the upload was asked for, so the
 * three requests need no table between them: the key it generated, the type and
 * size the author declared, and who asked. It is signed with the upload's own
 * key, so none of that can be changed on the way and no token of another kind
 * passes as one of these.
 */

/** How long an upload may take from being asked for to being completed. */
const LIFETIME_MS = 10 * 60 * 1000;

/** What an upload token says. */
const claimsSchema = z.strictObject({
  storageKey: z.string().regex(/^uploads\/[A-Za-z0-9_-]{22}$/),
  slug: z.string().regex(SLUG_PATTERN).max(SLUG_MAX_LENGTH),
  type: z.enum(ACCEPTED_IMAGE_TYPES),
  size: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
  userId: z.uuid(),
});

export type UploadClaims = z.infer<typeof claimsSchema> & { type: AcceptedImageType };

const uploadTokens = claimsToken("media-upload", claimsSchema);

/**
 * Issues a token for an upload.
 *
 * @param claims - What the server decided: the key, the type, the size and who asked.
 * @param now - The current time, which a test can fix.
 */
export function issueUploadToken(claims: UploadClaims, now = Date.now()): string {
  return uploadTokens.issue(claims, now + LIFETIME_MS);
}

/**
 * Reads a token back, or refuses it.
 *
 * @param token - As it arrived.
 * @param now - The current time, which a test can fix.
 * @returns The claims, or null when the signature is not this server's, the
 *   token is of another kind, or it has expired. One answer for all three, so a
 *   caller learns nothing about which.
 */
export function readUploadToken(token: string, now = Date.now()): UploadClaims | null {
  return uploadTokens.read(token, now);
}
