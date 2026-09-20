import { cp, mkdir } from "node:fs/promises";

/**
 * Copy the shared fonts, stylesheet and licence notices into an app's public root.
 * Existing unrelated files in that directory are preserved.
 * @param {URL} destination - The app's public asset directory.
 * @returns {Promise<void>}
 */
export async function copyFontAssets(destination) {
  await mkdir(destination, { recursive: true });
  await cp(new URL("./assets/", import.meta.url), destination, { recursive: true });
}
