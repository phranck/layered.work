import { Hono } from "hono";
import { type PublicSnapshot, readPublicSnapshot } from "../../content/snapshot.js";
import { database } from "../../db/connect.js";

/**
 * What the public website reads.
 *
 * **Deliberately unauthenticated.** It returns what the site displays to
 * anybody who visits it, so a session in front of it would mean the site holds
 * a credential granting exactly what is already public. That is a decision
 * rather than an omission, which is why it is written here.
 *
 * It takes no input at all: no path parameter, no query, no body. There is
 * nothing to validate because nothing is read from the request.
 */

export const content = new Hono();

/**
 * How long a built snapshot is reused, in milliseconds.
 *
 * The site renders on the server, so a burst of visitors is a burst of calls
 * here. Holding the result briefly turns that into one pass over the database
 * instead of one each, which is also why this route needs no rate limit: the
 * expensive part cannot be provoked more than twice a minute.
 *
 * Half a minute is short enough that a change made in the dashboard shows up
 * whilst somebody is still looking at the page they changed.
 */
const CACHE_MS = 30_000;

let held: { snapshot: PublicSnapshot; builtAt: number } | undefined;

content.get("/snapshot", async (c) => {
  if (!held || Date.now() - held.builtAt > CACHE_MS) {
    held = { snapshot: await readPublicSnapshot(database()), builtAt: Date.now() };
  }

  // Public by construction, so a cache in front may hold it for as long as this
  // process does.
  c.header("Cache-Control", `public, max-age=${CACHE_MS / 1000}`);
  return c.json(held.snapshot);
});

/** Drops the held snapshot, so a test sees what it just wrote. */
export function forgetHeldSnapshot(): void {
  held = undefined;
}
