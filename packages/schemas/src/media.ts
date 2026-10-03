import { z } from "zod";
import { body } from "./request.js";

/**
 * Uploading a file into the media library.
 *
 * Three requests: ask for an upload, send the bytes to the address that answer
 * names, and say it is done. The shapes live here because the dashboard builds
 * the first and the third and reads the answer to both.
 */

/**
 * The picture types the library accepts.
 *
 * Raster images only for now. Video, models and documents join with the screens
 * that need them, and each brings its own reader of the bytes.
 */
export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
] as const;

/** One accepted picture type. */
export type AcceptedImageType = (typeof ACCEPTED_IMAGE_TYPES)[number];

/** The largest file the library takes, in bytes: 20 MB. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** How long a file name may be, which is longer than any a person types. */
const MAX_FILENAME = 200;

/**
 * Asking for an upload.
 *
 * The name is what the slug is made from and nothing else, so it may not carry
 * a path separator or a control character. The type and the size are what the
 * reader declares, and the API checks both against the bytes once they arrive.
 */
export const createUploadBody = body({
  filename: z
    .string()
    .trim()
    .min(1)
    .max(MAX_FILENAME)
    // biome-ignore lint/suspicious/noControlCharactersInRegex: Control characters are what this refuses.
    .regex(/^[^/\\\u0000-\u001f\u007f]+$/),
  type: z.enum(ACCEPTED_IMAGE_TYPES),
  size: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
});

export type CreateUploadBody = z.infer<typeof createUploadBody>;

/**
 * The shape of an upload token: two base64url parts joined by a dot, the claims
 * and their signature. Bounded so a forged token costs nothing to refuse.
 */
export const uploadToken = z
  .string()
  .max(1_024)
  .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

/** What the API answers an upload request with. */
export const uploadTicket = z.object({
  /** Passed back when the bytes are sent. */
  token: uploadToken,
  /** Where to send the bytes, with `PUT`. */
  url: z.string().min(1),
  /** The headers that request has to carry, exactly. */
  headers: z.record(z.string(), z.string()),
});

export type UploadTicket = z.infer<typeof uploadTicket>;

/** Saying the bytes have been sent. */
export const completeUploadBody = body({ token: uploadToken });

export type CompleteUploadBody = z.infer<typeof completeUploadBody>;

/** A picture in the library, as an upload returns it. */
export const uploadedMedia = z.object({
  id: z.uuid(),
  slug: z.string(),
  url: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** Whether the same file was already in the library, so nothing new was stored. */
  existing: z.boolean(),
});

export type UploadedMedia = z.infer<typeof uploadedMedia>;
