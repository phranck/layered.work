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

/** How long to wait for the backend before falling back to the file. */
const TIMEOUT_MS = 2_000;

let held: { repository: ContentRepository; fetchedAt: number } | undefined;

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
    return await response.json();
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
 * The content repository every page reads from.
 *
 * @throws When neither the backend nor the file can supply a snapshot, because
 *   a site with no content is a fault rather than an empty site.
 */
export async function loadContent(): Promise<ContentRepository> {
  if (held && Date.now() - held.fetchedAt < CACHE_MS) return held.repository;

  const data = (await fromBackend()) ?? (await fromFile());
  if (!data) {
    throw new Error(
      "Neither API_URL nor WEBSITE_CONTENT_FILE produced a snapshot, so there is nothing to render.",
    );
  }

  const repository = createRepository(data);
  held = { repository, fetchedAt: Date.now() };
  return repository;
}

/** Drops the held snapshot, so a test sees what it just changed. */
export function forgetLoadedContent(): void {
  held = undefined;
}
