import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";

/**
 * The media objects of local work, answered by the development server at
 * their storage keys.
 *
 * The site addresses a file as `/<storage key>` below `MEDIA_ORIGIN`, which
 * names the bucket in a deployment. Locally that origin is unset, so the
 * address is the bare key, and this answers it from `MEDIA_LOCAL_DIR`, the
 * directory the backend reads and writes the same keys in. Only the
 * development server runs it, so a build carries none of it.
 */

/** The types a browser needs told for the files the library holds. Anything else it sniffs. */
const TYPES = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".glb": "model/gltf-binary",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".mp4": "video/mp4",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

/**
 * The file a request path names below the directory, or nothing where the path
 * is not one key inside it.
 *
 * @param root - The local media directory.
 * @param path - The request's path, such as `/migration/cover.webp`.
 */
export function localMediaFile(root, path) {
  const key = decodeURIComponent(path).replace(/^\/+/, "");
  if (!/^[a-z]+\/[a-zA-Z0-9_./-]+$/.test(key) || key.includes("..")) return undefined;
  const file = resolve(root, key);
  const inside = relative(resolve(root), file);
  if (isAbsolute(inside) || inside.startsWith(`..${sep}`)) return undefined;
  return file;
}

/**
 * A Vite plugin answering local media at their keys.
 *
 * @param root - The local media directory, or nothing where none is set, in
 *   which case the plugin does nothing.
 */
export function localMedia(root) {
  return {
    name: "layered:local-media",
    apply: "serve",
    configureServer(server) {
      if (!root) return;
      server.middlewares.use(async (request, response, next) => {
        const file = request.url ? localMediaFile(root, request.url.split("?")[0] ?? "") : undefined;
        const found = file ? await stat(file).catch(() => undefined) : undefined;
        if (!file || !found?.isFile()) return next();
        const type = TYPES[extname(file).toLowerCase()];
        if (type) response.setHeader("content-type", type);
        response.setHeader("content-length", String(found.size));
        createReadStream(file).pipe(response);
      });
    },
  };
}
