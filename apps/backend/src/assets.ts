/**
 * Where the site's wordmark is read from, by the social cards and by the watermark.
 *
 * The deployed service carries no `packages/ui`, so the build copies the file
 * into `dist/assets/` (`tools/copy-social-assets.mjs`). Run from source, it is
 * read where it lives.
 */
export const WORDMARK = new URL(
  import.meta.url.includes("/dist/") ? "./assets/logo.svg" : "../../../packages/ui/assets/logo.svg",
  import.meta.url,
);
