import { createHmac, hkdfSync } from "node:crypto";
import { ACCEPTED_IMAGE_TYPES, type AcceptedImageType, MAX_UPLOAD_BYTES } from "@layered/schemas";
import { z } from "zod";
import { sameSignature } from "../auth/signature.js";
import { sessionSecret } from "../config.js";

/**
 * The token an upload is carried by, from the request that asked for it to the
 * one that says it is done.
 *
 * It holds everything the server decided when the upload was asked for, so the
 * three requests need no table between them: the key it generated, the type and
 * size the author declared, who asked, and until when. It is signed, so none of
 * that can be changed on the way, and the signature uses a key derived for this
 * purpose alone, so a token of another kind can never pass as one of these even
 * where the two share a secret.
 */

/** What an upload token is for, written into it and checked on the way back. */
const PURPOSE = "media-upload";

/** How long an upload may take from being asked for to being completed. */
const LIFETIME_MS = 10 * 60 * 1000;

/** The signing key, derived from the session secret for this purpose only. */
const KEY = Buffer.from(hkdfSync("sha256", sessionSecret, "", `layered:${PURPOSE}`, 32));

/** What an upload token says. */
const claimsSchema = z.strictObject({
  purpose: z.literal(PURPOSE),
  storageKey: z.string().regex(/^uploads\/[A-Za-z0-9_-]{22}$/),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(80),
  type: z.enum(ACCEPTED_IMAGE_TYPES),
  size: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
  userId: z.uuid(),
  expiresAt: z.number().int(),
});

export type UploadClaims = Omit<z.infer<typeof claimsSchema>, "purpose" | "expiresAt"> & {
  type: AcceptedImageType;
};

function sign(payload: string): string {
  return createHmac("sha256", KEY).update(payload).digest("base64url");
}

/**
 * Issues a token for an upload.
 *
 * @param claims - What the server decided: the key, the type, the size and who asked.
 * @param now - The current time, which a test can fix.
 */
export function issueUploadToken(claims: UploadClaims, now = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({ purpose: PURPOSE, ...claims, expiresAt: now + LIFETIME_MS }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
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
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  if (!sameSignature(signature, sign(payload))) return null;

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const parsed = claimsSchema.safeParse(decoded);
  if (!parsed.success || parsed.data.expiresAt <= now) return null;

  const { purpose: _purpose, expiresAt: _expiresAt, ...claims } = parsed.data;
  return claims;
}
