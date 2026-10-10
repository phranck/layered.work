/**
 * Where the library's files lie in the bucket, and where the export's snapshot
 * says the migrated ones are.
 *
 * The API writes these keys, the import reads them, and the site turns them into
 * addresses, so all three take the prefixes from here.
 */

/** Where an upload's bytes lie, under a name the API generates. */
export const UPLOAD_KEY_PREFIX = "uploads/";

/** Where the migrated files lie: each under the name the export gave it. */
export const MIGRATION_KEY_PREFIX = "migration/";

/**
 * Where the export's snapshot says a migrated file is, which is where the same
 * file lies in the site's `public/` directory.
 */
export const EXPORT_MEDIA_PATH = "/media/";

/**
 * The path the export's snapshot names a migrated file by, from its key in the
 * bucket, or nothing for a file that was not migrated.
 *
 * @param storageKey - The file's key, such as `migration/cover.webp`.
 * @returns Its export path, such as `/media/cover.webp`.
 */
export function exportMediaPath(storageKey: string): string | undefined {
  return storageKey.startsWith(MIGRATION_KEY_PREFIX)
    ? `${EXPORT_MEDIA_PATH}${storageKey.slice(MIGRATION_KEY_PREFIX.length)}`
    : undefined;
}
