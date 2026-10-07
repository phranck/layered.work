import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { REPOSITORY_ROOT } from "../media/storage.js";
import type { MediaRoots } from "./import-content.js";

/** The website's `public/`, which answers the old site's `/media/…` paths. */
const EXPORTED = fileURLToPath(new URL("../../../website/public/", import.meta.url));

/**
 * Where `db:import` and `db:import-variants` read the files whose sizes they
 * measure.
 *
 * The local store is the directory the backend serves its objects from, read
 * against the repository's root as the backend reads it, so a file the
 * snapshot names by storage key is found where the dashboard put it.
 *
 * @param exported - `--variant-root`, where the old site's files are, when given.
 */
export function mediaRoots(exported?: string): MediaRoots {
  return {
    exported: resolve(exported ?? EXPORTED),
    ...(config.MEDIA_LOCAL_DIR ? { stored: resolve(REPOSITORY_ROOT, config.MEDIA_LOCAL_DIR) } : {}),
  };
}
