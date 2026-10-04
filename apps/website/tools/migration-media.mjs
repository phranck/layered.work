import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { localMediaFile } from "./local-media.mjs";

/** Checks the files a rendered page names against the local source of bucket objects. */
export function migrationMedia(assets, { localRoot, clientRoot }) {
  const byPath = new Map(assets.map((asset) => [new URL(asset.src, "https://layered.work").pathname, asset]));
  const storagePrefixes = new Set(assets.map((asset) => asset.source.split("/")[0]).filter(Boolean));

  function isMediaPath(pathname) {
    return (
      byPath.has(pathname) ||
      pathname.startsWith("/media/") ||
      pathname.startsWith("/migration/") ||
      [...storagePrefixes].some((prefix) => pathname.startsWith(`/${prefix}/`))
    );
  }

  async function inspect(pathname) {
    const asset = byPath.get(pathname);
    if (!asset && !pathname.startsWith("/media/") && !pathname.startsWith("/migration/")) {
      return `unresolved media reference ${pathname}`;
    }

    const file = asset
      ? localMediaFile(localRoot, `/${asset.source}`)
      : pathname.startsWith("/migration/")
        ? localMediaFile(localRoot, pathname)
        : localMediaFile(clientRoot, pathname);
    if (!file) return `missing file ${pathname}`;
    let bytes;
    try {
      bytes = await readFile(file);
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") return `missing file ${pathname}`;
      throw error;
    }
    const checksum = createHash("sha256").update(bytes).digest("hex");
    if (asset && checksum !== asset.sha256) return `changed file ${pathname}`;
    return null;
  }

  return { isMediaPath, inspect };
}
