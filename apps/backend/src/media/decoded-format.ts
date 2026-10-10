import { ACCEPTED_IMAGE_TYPES, type AcceptedImageType } from "@layered/schemas";

/**
 * What sharp reports as the format of a decoded picture, by the picture's own
 * format name.
 *
 * Sharp decodes AVIF as HEIF with AV1 inside, so an AVIF file reports the
 * container's name. Every other format reports its own. The upload and the
 * import both check a file against what it claims to be, so both ask here.
 *
 * @param format - The format's own name, such as `avif` or `png`.
 */
export function decodedFormatName(format: string): string {
  return format === "avif" ? "heif" : format;
}

/** Each accepted picture type, by the format name sharp reports for it. */
export const DECODED_IMAGE_TYPES: Readonly<Record<string, AcceptedImageType>> = Object.fromEntries(
  ACCEPTED_IMAGE_TYPES.map((type) => [decodedFormatName(type.slice("image/".length)), type]),
);
