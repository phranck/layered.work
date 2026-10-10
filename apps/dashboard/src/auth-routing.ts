import { START_PATH } from "./routes.js";

/**
 * Where a sign-in may send the reader afterwards: the path it names, kept only
 * while it stays on the dashboard's own origin and is not the sign-in screen
 * itself, and the start otherwise.
 *
 * The path is resolved against the origin the dashboard runs on, so a value
 * the browser would read as another host, such as `//elsewhere` or `/\elsewhere`,
 * resolves off it and is refused.
 *
 * @param value - The `returnTo` the sign-in address carries, if any.
 * @returns A path on the dashboard, with its query and fragment.
 */
export function safeReturnTo(value: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//")) return START_PATH;
  try {
    const origin = window.location.origin;
    const target = new URL(value, origin);
    if (target.origin !== origin || target.pathname === "/login") return START_PATH;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return START_PATH;
  }
}

export function expirationLoginLocation(location: {
  pathname: string;
  search: string;
  hash: string;
}): string | null {
  if (location.pathname === "/login") return null;
  const returnTo = safeReturnTo(`${location.pathname}${location.search}${location.hash}`);
  return `/login?expired=1&returnTo=${encodeURIComponent(returnTo)}`;
}
