/** Private upstream used by nginx and the Vite development proxy. */
export function dashboardApiOrigin(command = "build") {
  const value =
    process.env.API_ORIGIN ?? (command === "serve" ? "http://localhost:4002" : "http://backend.zerops:3000");
  return httpOrigin(value, "API_ORIGIN", ["http:", "https:"]);
}

/**
 * The request paths the Vite development proxy hands to the API, as the key Vite
 * reads.
 *
 * Vite treats a proxy key that begins with `^` as a regular expression and any
 * other key as a prefix, so a plain `/api` would also take the dashboard's own
 * `/api-tokens` route. This pattern takes `/api` only as a whole segment. The
 * same pattern strips the prefix before the request reaches the API. Production
 * is nginx's `location /api/`, which the trailing slash already bounds.
 */
export const DEVELOPMENT_API_PATH = "^/api(?=/|$)";

/** Public write endpoint for presigned uploads, supplied by the Zerops dashboard build. */
export function dashboardUploadOrigin() {
  const value = process.env.S3_UPLOAD_ORIGIN;
  return value ? httpOrigin(value, "S3_UPLOAD_ORIGIN", ["https:"]) : undefined;
}

/** An origin inserted into nginx configuration may contain no credentials or extra URL parts. */
function httpOrigin(value, name, protocols) {
  const kind = protocols.length === 1 ? "HTTPS" : "HTTP(S)";
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid ${kind} origin.`);
  }
  if (
    !protocols.includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${name} must be an ${kind} origin without credentials, path, query or fragment.`);
  }
  return url.origin;
}
