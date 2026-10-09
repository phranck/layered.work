import type { media, mediaVariants } from "../db/schema/index.js";
import { variantChecksum, variantMimeType } from "./variants.js";

type Media = typeof media.$inferSelect;
type MediaVariant = typeof mediaVariants.$inferSelect;

/** The file a reader is given for a picture, described the way the snapshot publishes it. */
export interface DeliveredFile {
  storageKey: string;
  mimeType: string;
  byteSize: number;
  /** The SHA-256 of the delivered bytes, or an empty string where the key does not name it. */
  checksum: string;
}

/**
 * The file a reader is given for a picture.
 *
 * An unmarked picture is delivered as its original. A watermarked one only
 * through its derived sizes, and its widest size, WebP before AVIF, stands in
 * for the original, so the original's storage key never leaves the API. Right
 * after the watermark is switched on, that is still an unmarked size until the
 * new run publishes, which is no larger than 2360 pixels. Only a picture that
 * has no size at all, because it is narrower than the smallest one and has never
 * been processed with its mark, is delivered as its original.
 *
 * @param picture - The library row.
 * @param variants - The picture's derived sizes, in any order.
 */
export function deliveredFile(
  picture: Pick<Media, "storageKey" | "mimeType" | "byteSize" | "checksum" | "watermark">,
  variants: readonly Pick<MediaVariant, "format" | "width" | "storageKey" | "byteSize">[],
): DeliveredFile {
  const original = {
    storageKey: picture.storageKey,
    mimeType: picture.mimeType,
    byteSize: picture.byteSize,
    checksum: picture.checksum,
  };
  if (!picture.watermark) return original;
  const [widest] = [...variants].sort(
    (left, right) =>
      right.width - left.width || Number(right.format === "webp") - Number(left.format === "webp"),
  );
  if (!widest) return original;
  return {
    storageKey: widest.storageKey,
    mimeType: variantMimeType(widest.format),
    byteSize: widest.byteSize,
    checksum: variantChecksum(widest.storageKey) ?? "",
  };
}
