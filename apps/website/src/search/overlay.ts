/**
 * The search overlay, and the matching behind it.
 *
 * The index is fetched once, the first time the overlay opens, because it
 * carries every public body and nothing on a page needs it until somebody
 * searches. Matching runs against text already folded to lower case by the
 * server, so a keystroke costs one `includes` per entry.
 */

export type { SearchIndexEntry } from "../content/repository.js";

import type { SearchIndexEntry } from "../content/repository.js";

/** How many results the panel shows before asking the reader to open the page. */
export const OVERLAY_RESULT_LIMIT = 6;

/**
 * The entries matching what has been typed.
 *
 * A title match comes first, because somebody typing a name is looking for that
 * entry rather than for the entries mentioning it. Within each group the index
 * order holds, which is newest first.
 *
 * @param index - Every public entry of the current language.
 * @param query - What the reader typed, in any case, possibly padded.
 * @param limit - The most entries to return.
 * @returns The matches, title matches first, never more than `limit`.
 */
export function findEntries(
  index: readonly SearchIndexEntry[],
  query: string,
  limit: number = OVERLAY_RESULT_LIMIT,
): SearchIndexEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const titles: SearchIndexEntry[] = [];
  const bodies: SearchIndexEntry[] = [];
  for (const entry of index) {
    if (entry.title.toLowerCase().includes(needle)) titles.push(entry);
    else if (entry.text.includes(needle)) bodies.push(entry);
  }
  return [...titles, ...bodies].slice(0, limit);
}
