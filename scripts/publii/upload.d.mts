/**
 * The part of `upload.mjs` another package calls: the choice of what goes into
 * the bucket and under which key. Declared so a TypeScript caller can import it
 * without the script itself being compiled.
 */

/** One file the upload writes, under the key it will have in the bucket. */
export interface UploadObject {
  key: string;
  filename: string;
  mime: string;
  bytes: number;
  sha256: string;
}

/** A file the upload leaves out, and why. */
export interface SkippedFile {
  slug: string;
  bytes: number;
  reason: string;
}

/**
 * What goes up and what stays behind, decided from the export alone.
 *
 * @param site - The parsed `site.json`.
 * @param report - The parsed `media-report.json`.
 */
export function selectObjects(
  site: {
    entries: { body: string; featuredImage?: string | null }[];
    media: {
      slug: string;
      src: string;
      source: string;
      filename: string;
      mime: string;
      bytes: number;
      sha256: string;
    }[];
  },
  report: { variants: { src: string; bytes: number; sha256: string }[] },
): { objects: UploadObject[]; skipped: SkippedFile[] };
