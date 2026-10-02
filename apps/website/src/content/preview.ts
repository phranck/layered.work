import { type ContentRepository, createRepository } from "./repository.js";

/**
 * Where a preview's content comes from: the API, which holds what the editor
 * sent and is the only thing that can tell a valid preview token from a forged
 * one.
 *
 * Never cached here, and never taken from the committed file, because a preview
 * is by definition something the published content does not contain yet.
 */

/** How long to wait for the API before saying the preview is unavailable. */
const TIMEOUT_MS = 2_000;

/** The shape a preview token has, checked before it reaches an address. */
const TOKEN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/** The longest token accepted, matching the API's own bound. */
const TOKEN_MAX_LENGTH = 512;

/**
 * The preview a token names, as a repository holding its one entry.
 *
 * @param token - From the address.
 * @returns The repository, or undefined when the token is malformed, unknown,
 *   expired or forged, or when the API cannot be reached. All of those leave the
 *   reader with the same page, because none of them is theirs to fix.
 */
export async function loadPreview(token: string): Promise<ContentRepository | undefined> {
  const base = process.env.API_URL;
  if (!base || token.length > TOKEN_MAX_LENGTH || !TOKEN.test(token)) return undefined;

  try {
    const response = await fetch(new URL(`/previews/${token}`, base), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return undefined;
    return createRepository(await response.json());
  } catch {
    return undefined;
  }
}
