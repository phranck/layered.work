import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { type ContentRepository, createRepository } from "./repository.js";

/**
 * Where the site's content comes from.
 *
 * The backend when it answers, and the committed file when it does not. Both
 * carry the same shape, which is what makes the fallback a fallback rather than
 * a second implementation: `createRepository` cannot tell them apart.
 *
 * The order is the point. The database is what a person edits, so it leads. The
 * file is what the migration produced, so it is what the site falls back to
 * rather than an error page, and it stops being needed once the database holds
 * everything the file does.
 *
 * A missing source is an operational error and never an empty successful page,
 * which is why both being absent throws rather than returning nothing.
 */

/**
 * How long a fetched snapshot is reused, in milliseconds.
 *
 * Short, because a render must not serve yesterday's page, and not zero,
 * because one page is several renders and each of them asks. The backend holds
 * its own for the same span, so the two together mean a burst of visitors costs
 * one pass over the database.
 */
const CACHE_MS = 30_000;

/**
 * How long a held snapshot keeps answering while a newer one is fetched, in
 * milliseconds.
 *
 * Past `CACHE_MS` a render does not wait for the backend. It answers from what
 * is held and starts a refresh, and the renders after it read what the refresh
 * brought. A refresh costs the backend a pass over the database once its own
 * cache has run out, and on the deployed containers that is several hundred
 * milliseconds; without this, whichever reader came first after the cache ran
 * out paid for it in their first byte. Past this limit the held snapshot is too
 * old to show, so the render waits, as it does when nothing is held yet.
 */
const STALE_MS = 5 * 60_000;

/** How long to wait for the backend before falling back to the file. */
const TIMEOUT_MS = 2_000;

let held: { repository: ContentRepository; fetchedAt: number } | undefined;

/** The refresh in progress, shared so renders arriving together ask the backend once. */
let pending: Promise<ContentRepository> | undefined;

/**
 * Asks the backend for the published content.
 *
 * @returns The snapshot, or undefined when the backend is absent, slow or
 *   unhappy. Every one of those is a reason to read the file instead rather
 *   than to fail, because the file is a correct answer and an error page is not.
 */
async function fromBackend(): Promise<unknown | undefined> {
  const base = process.env.API_URL;
  if (!base) return undefined;

  try {
    const response = await fetch(new URL("/content/snapshot", base), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return undefined;

    const snapshot = await response.json();

    // A database holding no entries is a database nothing has been written into
    // yet, not a site with nothing on it. Answering with it empties every page
    // whilst every check stays green, because the response was a success and the
    // shape was right, which is exactly what happened on 23 September 2026: the
    // site went live against an empty production database and served a home page
    // with no hero, no feature and no cards.
    //
    // The file is the better answer for as long as it has more to say. This
    // stops applying on its own once the database carries the content.
    if (!Array.isArray(snapshot?.entries) || snapshot.entries.length === 0) return undefined;

    return snapshot;
  } catch {
    return undefined;
  }
}

/** Reads the committed file, which the deployment always ships. */
async function fromFile(): Promise<unknown | undefined> {
  const filename = process.env.WEBSITE_CONTENT_FILE;
  if (!filename) return undefined;
  return JSON.parse(await readFile(resolve(filename), "utf8"));
}

/**
 * Fetches the content and holds it, once at a time.
 *
 * @returns The repository built from what arrived.
 * @throws When neither the backend nor the file can supply a snapshot.
 */
function refresh(): Promise<ContentRepository> {
  pending ??= (async () => {
    try {
      const data = (await fromBackend()) ?? (await fromFile());
      if (!data) {
        throw new Error(
          "Neither API_URL nor WEBSITE_CONTENT_FILE produced a snapshot, so there is nothing to render.",
        );
      }

      const repository = createRepository(data);
      held = { repository, fetchedAt: Date.now() };
      return repository;
    } finally {
      pending = undefined;
    }
  })();
  return pending;
}

/**
 * The content repository every page reads from.
 *
 * Fresh for `CACHE_MS`. After that it answers from what is held while a
 * refresh runs behind the render, until the held snapshot reaches `STALE_MS`.
 *
 * @throws When neither the backend nor the file can supply a snapshot, because
 *   a site with no content is a fault rather than an empty site.
 */
export async function loadContent(): Promise<ContentRepository> {
  const age = held ? Date.now() - held.fetchedAt : Number.POSITIVE_INFINITY;
  if (held && age < CACHE_MS) return held.repository;

  if (held && age < STALE_MS) {
    // A refresh that fails leaves the held snapshot where it is, and the next
    // render past `CACHE_MS` tries again. Once the snapshot is too old to show,
    // a render waits for the refresh and the page reports a failure itself.
    refresh().catch(() => undefined);
    return held.repository;
  }

  return refresh();
}

/** Drops the held snapshot, so a test sees what it just changed. */
export function forgetLoadedContent(): void {
  held = undefined;
  pending = undefined;
}
