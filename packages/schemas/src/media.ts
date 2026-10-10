import { z } from "zod";
import { body, MaxLength, signedToken } from "./request.js";
import { mediaCredit } from "./unsplash.js";

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

/** An upload token as it arrives. */
export const uploadToken = signedToken(1_024);

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

/** Processing state shared by the library and its detail view. */
export const mediaProcessingState = z.enum(["queued", "processing", "ready", "failed"]);
export const mediaProcessing = z.object({
  state: mediaProcessingState,
  errorId: z.uuid().nullable(),
  variants: z.array(
    z.object({
      format: z.enum(["avif", "webp", "jpeg", "png"]),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      byteSize: z.number().int().positive(),
      storageKey: z.string(),
    }),
  ),
});
export type MediaProcessing = z.infer<typeof mediaProcessing>;

/**
 * Where a watermark sits on a picture: a corner, the middle of an edge, or the centre.
 *
 * The database enum, the API and the dashboard's select all read this list, so a
 * position offered in one is accepted by the others.
 */
export const WATERMARK_ANCHORS = [
  "top-left",
  "top",
  "top-right",
  "left",
  "center",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
] as const;

/** One position a watermark can take. */
export type WatermarkAnchor = (typeof WATERMARK_ANCHORS)[number];

/** A watermark position, or null for a picture that is delivered without one. */
export const watermark = z.enum(WATERMARK_ANCHORS).nullable();

/** The author's crop anchor, independent of any display ratio. */
export const focalPoint = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });
export type FocalPoint = z.infer<typeof focalPoint>;
export const updateMediaFocalBody = body({ x: focalPoint.shape.x, y: focalPoint.shape.y });

/** Supported library kinds; upload acceptance remains a separate byte-level policy. */
export const MEDIA_KINDS = ["image", "video", "document", "model"] as const;

/** One kind of file the library holds. */
export type MediaKind = (typeof MEDIA_KINDS)[number];

/**
 * The types an upload may declare, by the kind of file it becomes.
 *
 * A kind with no entry cannot be uploaded yet. The editor reads this to know
 * where offering an upload makes sense and what a dropped file becomes, so a
 * kind added here reaches both with nothing else edited.
 */
export const UPLOAD_TYPES: Readonly<Partial<Record<MediaKind, readonly string[]>>> = {
  image: ACCEPTED_IMAGE_TYPES,
};

/**
 * The kind of file an upload of this type becomes.
 *
 * @param type - The MIME type the file declares.
 * @returns The kind, or nothing for a type the library does not accept.
 */
export function uploadKindOf(type: string): MediaKind | undefined {
  return MEDIA_KINDS.find((kind) => UPLOAD_TYPES[kind]?.includes(type));
}

/**
 * The orders the library can be listed in: by slug, which is how the library
 * screen reads, or newest first, which is how the editor offers files.
 */
export const MEDIA_ORDERS = ["slug", "newest"] as const;

/** One order the library can be listed in. */
export type MediaOrder = (typeof MEDIA_ORDERS)[number];
export const mediaDescriptions = z.object({
  en: z.object({ altText: z.string().nullable(), caption: z.string().nullable() }),
  de: z.object({ altText: z.string().nullable(), caption: z.string().nullable() }),
});
export const mediaLibraryQuery = z.object({
  search: z.string().trim().max(MaxLength.Line).default(""),
  kind: z.enum(["all", ...MEDIA_KINDS]).default("all"),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  order: z.enum(MEDIA_ORDERS).default("slug"),
  unused: z.preprocess(
    (value) => (value === "true" ? true : value === "false" ? false : value),
    z.boolean().optional(),
  ),
});
export type MediaLibraryQuery = z.infer<typeof mediaLibraryQuery>;
export const mediaLibraryItem = z.object({
  id: z.uuid(),
  slug: z.string(),
  kind: z.enum(MEDIA_KINDS),
  mimeType: z.string(),
  byteSize: z.number().int().nonnegative(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  uploadedAt: z.iso.datetime(),
  url: z.string().nullable(),
  processingState: mediaProcessingState,
  focalPoint,
});
export type MediaLibraryItem = z.infer<typeof mediaLibraryItem>;
export const mediaLibraryPage = z.object({
  items: z.array(mediaLibraryItem),
  page: z.number().int().positive(),
  hasMore: z.boolean(),
});
export type MediaLibraryPage = z.infer<typeof mediaLibraryPage>;
export const mediaUse = z.object({
  id: z.uuid(),
  title: z.string(),
  language: z.enum(["en", "de"]),
  kind: z.enum(["post", "page", "project", "account", "settings"]),
  settingsGroup: z.enum(["site", "postListing", "projectListing"]).optional(),
});
export const mediaDetail = mediaLibraryItem.extend({
  translations: mediaDescriptions,
  processing: mediaProcessing,
  uses: z.array(mediaUse),
  watermark,
  /** Who took the picture, for one that comes from Unsplash; null for everything uploaded here. */
  credit: mediaCredit.nullable(),
});
export type MediaDetail = z.infer<typeof mediaDetail>;
export const saveMediaMetadataBody = body({
  focalPoint,
  /** Absent leaves the picture's watermark as it is, so a client that does not know it changes nothing. */
  watermark: watermark.optional(),
  translations: z
    .array(
      body({
        language: z.enum(["en", "de"]),
        altText: z.string().max(MaxLength.Paragraph).nullable(),
        caption: z.string().max(MaxLength.Paragraph).nullable(),
      }),
    )
    .length(2)
    .refine(
      (items) => new Set(items.map((item) => item.language)).size === 2,
      "Both languages must be supplied once.",
    ),
});
export type SaveMediaMetadataBody = z.infer<typeof saveMediaMetadataBody>;
export const mediaDeletionResult = z.object({
  deleted: z.literal(true),
  cleanupState: z.enum(["ready", "pending"]),
  removedObjects: z.number().int().nonnegative(),
  errorId: z.uuid().nullable(),
});
export type MediaDeletionResult = z.infer<typeof mediaDeletionResult>;
