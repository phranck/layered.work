import type { EntryKind, SearchResults } from "@layered/schemas";
import { useQuery } from "@tanstack/react-query";
import { useDashboardApi } from "./dashboard-context.js";
import type { DashboardStringKey } from "./dashboard-i18n.js";
import { queryKeys } from "./query-keys.js";
import { entryPath, MEDIA_PATH } from "./routes.js";
import { useSettledValue } from "./settled-value.js";

/**
 * What the search dialog asks of the API, and the hits it lists, flattened so
 * the arrow keys move across entries and media alike.
 */

/** How long typing has to pause before the dialog asks the API, in milliseconds. */
const SEARCH_DELAY_MS = 150;

/** The catalogue word for each kind of entry, as a hit's note. */
export const ENTRY_KIND_TEXT: Record<EntryKind, DashboardStringKey> = {
  post: "kindPost",
  page: "kindPage",
  project: "kindProject",
};

/**
 * One hit, whichever kind it is.
 *
 * @property key - Unique across both kinds, and the id of its option in the list.
 * @property path - Where opening it leads.
 * @property note - The entry's kind, or the file's alt text.
 * @property language - The entry's language; a file has none.
 */
export interface Hit {
  key: string;
  path: string;
  title: string;
  note: string;
  thumbnailUrl: string | null;
  language?: string;
  group: "entries" | "media";
}

/**
 * The hits of a search, entries first and then media.
 *
 * @param results - What the API found, or nothing yet.
 * @param kindText - The word for an entry's kind, in the interface language.
 */
export function hitsOf(results: SearchResults | undefined, kindText: (kind: EntryKind) => string): Hit[] {
  if (!results) return [];
  return [
    ...results.entries.map((hit) => ({
      key: `entry-${hit.id}`,
      path: entryPath(hit.kind, hit.id),
      title: hit.title,
      note: kindText(hit.kind),
      thumbnailUrl: null,
      language: hit.language,
      group: "entries" as const,
    })),
    ...results.media.map((hit) => ({
      key: `media-${hit.id}`,
      // A file has no screen of its own; it opens in the library.
      path: MEDIA_PATH,
      title: hit.slug,
      note: hit.altText ?? "",
      thumbnailUrl: hit.thumbnailUrl,
      group: "media" as const,
    })),
  ];
}

/**
 * What a search finds in entries and media, asked once typing has paused.
 *
 * @param typed - What is in the field.
 * @returns The text that was asked for, empty until something is typed, and the query.
 */
export function useSearchResults(typed: string) {
  const api = useDashboardApi();
  const settled = useSettledValue(typed.trim(), SEARCH_DELAY_MS);
  const results = useQuery({
    queryKey: queryKeys.search(settled),
    queryFn: () => api.search(settled),
    enabled: settled.length > 0,
  });
  return { settled, results };
}
