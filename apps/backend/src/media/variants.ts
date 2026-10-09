import { createHash } from "node:crypto";
import type { WatermarkAnchor } from "@layered/schemas";
import sharp, { type OverlayOptions } from "sharp";
import type { mediaVariants } from "../db/schema/index.js";

type MediaVariant = typeof mediaVariants.$inferSelect;

export type ImageVariant = { format: "avif" | "webp"; width: number; height: number; bytes: Buffer };

/** 348: three cards in the 1092px page; 696: retina cards/two columns;
 * 1180: the article's declared image size; 2360: retina article images. */
export const IMAGE_WIDTHS = [348, 696, 1180, 2360] as const;

/** How wide the mark is drawn, as a share of the width of the size it is laid on. */
const MARK_WIDTH_SHARE = 0.2;

/** How tall the mark may be at most, as a share of the size's height, so a panorama's mark stays inside its strip. */
const MARK_HEIGHT_SHARE = 0.2;

/** The gap between the mark and the edges it sits against, as a share of the size's shorter side. */
const MARK_MARGIN_SHARE = 0.03;

/** How opaque the mark is, so the picture underneath it stays readable. */
const MARK_OPACITY = 0.8;

/**
 * The density a vector mark is rasterised at: three times the 72 dpi an SVG
 * renders at by default, so the wordmark's 900 unit viewBox becomes 2700 pixels
 * and is only ever scaled down.
 */
const MARK_DENSITY = 216;

/** Where sharp places an overlay for each anchor. */
const GRAVITY: Record<WatermarkAnchor, string> = {
  "top-left": "northwest",
  top: "north",
  "top-right": "northeast",
  left: "west",
  center: "centre",
  right: "east",
  "bottom-left": "southwest",
  bottom: "south",
  "bottom-right": "southeast",
};

/** A mark ready to be laid over a picture, and the anchor it goes to. */
export interface Watermark {
  /** The mark as a PNG, rasterised and trimmed of its empty margin by `prepareMark`. */
  mark: Buffer;
  anchor: WatermarkAnchor;
}

/**
 * Turns a mark's file into the picture that is laid over others.
 *
 * A vector file is rasterised large and every file is trimmed, because the
 * wordmark's viewBox carries empty margin, and a mark measured with its margin
 * sits visibly smaller and further from the edge than the one asked for.
 *
 * @param bytes - The mark's file: the wordmark's SVG or a library picture.
 * @returns A PNG with transparency, which `deriveImageVariants` scales per size.
 */
export async function prepareMark(bytes: Buffer): Promise<Buffer> {
  return sharp(bytes, { density: MARK_DENSITY }).trim().png().toBuffer();
}

/**
 * The mark for one size, scaled, faded and padded towards the edges it sits against.
 *
 * The padding is how the margin is kept: sharp places an overlay against the
 * edges its gravity names, so a transparent border on those sides moves the mark
 * inwards without the exact height of the resized picture being known.
 *
 * @param watermark - The prepared mark and its anchor.
 * @param width - The width of the size it is laid on.
 * @param height - That size's height, near enough to bound the mark.
 */
async function overlay(watermark: Watermark, width: number, height: number): Promise<OverlayOptions> {
  const { anchor } = watermark;
  const margin = Math.round(Math.min(width, height) * MARK_MARGIN_SHARE);
  const input = await sharp(watermark.mark)
    .resize({
      width: Math.max(1, Math.round(width * MARK_WIDTH_SHARE)),
      height: Math.max(1, Math.round(height * MARK_HEIGHT_SHARE)),
      fit: "inside",
    })
    .ensureAlpha()
    .linear([1, 1, 1, MARK_OPACITY], [0, 0, 0, 0])
    .extend({
      top: anchor.startsWith("top") ? margin : 0,
      bottom: anchor.startsWith("bottom") ? margin : 0,
      left: anchor.endsWith("left") ? margin : 0,
      right: anchor.endsWith("right") ? margin : 0,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  return { input, gravity: GRAVITY[anchor] };
}

/**
 * Where a derived size is stored.
 *
 * The run's token keeps two runs for one picture from writing to the same key,
 * and the file is named by the SHA-256 of its bytes, which `variantChecksum`
 * reads back.
 *
 * @param mediaId - The picture.
 * @param token - The run that derived the size.
 * @param variant - The size's bytes and format.
 */
export function variantStorageKey(
  mediaId: string,
  token: string,
  variant: Pick<ImageVariant, "bytes" | "format">,
): string {
  return `variants/${mediaId}/${token}/${createHash("sha256").update(variant.bytes).digest("hex")}.${variant.format}`;
}

/**
 * The SHA-256 a size's storage key names, or nothing for a key written some other
 * way, such as by the import of the old site's sizes.
 *
 * @param storageKey - The size's key.
 */
export function variantChecksum(storageKey: string): string | undefined {
  return /\/([0-9a-f]{64})\.[a-z]+$/.exec(storageKey)?.[1];
}

/**
 * The `Content-Type` a derived size is stored with.
 *
 * Every value of `image_format` is the `image/` subtype of the same name. The job that
 * writes a size and the command that puts it back into the bucket both ask here, so the
 * bucket serves a size with one type whichever of the two stored it.
 *
 * @param format - The size's format, as `media_variants.format` records it.
 * @returns The MIME type, such as `image/avif`.
 */
export function variantMimeType(format: MediaVariant["format"]): string {
  return `image/${format}`;
}

/**
 * Derives every size of a picture, with its watermark where it has one.
 *
 * Originals stay untouched. Derived bytes apply orientation and discard
 * metadata. A watermarked picture is delivered only through these sizes, so it
 * also gets one at its own full width, and that is the largest version of it a
 * reader can reach.
 *
 * @param bytes - The original.
 * @param watermark - The mark and where it goes, or nothing for an unmarked picture.
 */
export async function deriveImageVariants(
  bytes: Buffer,
  watermark?: Watermark,
): Promise<{ variants: ImageVariant[]; placeholder: string }> {
  const metadata = await sharp(bytes).metadata();
  const { width, height } = metadata.autoOrient;
  const widths: number[] = IMAGE_WIDTHS.filter((step) => step <= width);
  if (watermark && !widths.includes(width)) widths.push(width);
  const variants: ImageVariant[] = [];
  for (const step of widths) {
    for (const format of ["avif", "webp"] as const) {
      // WebP retains all animation frames. AVIF and the blur use the first frame,
      // and so does a watermarked WebP, because the mark is laid over one picture.
      let source = sharp(bytes, { animated: format === "webp" && !watermark })
        .autoOrient()
        .resize({ width: step, withoutEnlargement: true });
      if (watermark) source = source.composite([await overlay(watermark, step, (height * step) / width)]);
      const result = await (format === "avif"
        ? source.avif({ quality: 60, effort: 3 })
        : source.webp({ quality: 82 })
      ).toBuffer({ resolveWithObject: true });
      variants.push({
        format,
        width: result.info.width,
        height: result.info.pageHeight ?? result.info.height,
        bytes: result.data,
      });
    }
  }
  const placeholder = await sharp(bytes)
    .autoOrient()
    .resize({ width: 16, withoutEnlargement: true })
    .blur(1)
    .webp({ quality: 30 })
    .toBuffer();
  return { variants, placeholder: `data:image/webp;base64,${placeholder.toString("base64")}` };
}
