import sharp from "sharp";
import type { mediaVariants } from "../db/schema/index.js";

type MediaVariant = typeof mediaVariants.$inferSelect;

export type ImageVariant = { format: "avif" | "webp"; width: number; height: number; bytes: Buffer };

/** 348: three cards in the 1092px page; 696: retina cards/two columns;
 * 1180: the article's declared image size; 2360: retina article images. */
export const IMAGE_WIDTHS = [348, 696, 1180, 2360] as const;

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

/** Originals stay untouched. Derived bytes apply orientation and discard metadata. */
export async function deriveImageVariants(
  bytes: Buffer,
): Promise<{ variants: ImageVariant[]; placeholder: string }> {
  const metadata = await sharp(bytes).metadata();
  const width = metadata.autoOrient.width;
  const variants: ImageVariant[] = [];
  for (const step of IMAGE_WIDTHS.filter((step) => step <= width)) {
    for (const format of ["avif", "webp"] as const) {
      // WebP retains all animation frames. AVIF and the blur use the first frame.
      const source = sharp(bytes, { animated: format === "webp" })
        .autoOrient()
        .resize({ width: step, withoutEnlargement: true });
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
