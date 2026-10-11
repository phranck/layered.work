import {
  CONTENT_LANGUAGES,
  type ContentLanguage,
  type EntryListItem,
  type PublicationState,
} from "@layered/schemas";
import type { DashboardStringKey } from "./dashboard-i18n.js";

/**
 * The rules an entry list follows, and the names and tones every screen gives an
 * entry's state and language.
 *
 * The list, the editor, its panel and the topic field all read these, so a
 * state looks the same and a language is called the same wherever it appears.
 */

/**
 * What the reader narrowed the list to. `all` leaves that dimension open, and
 * `trash` shows what is in the trash, which every other choice leaves out.
 */
export interface EntryFilter {
  search: string;
  state: PublicationState | "all" | "trash";
  language: ContentLanguage | "all";
}

/** The filter a list opens with, which shows everything. */
export const OPEN_FILTER: EntryFilter = { search: "", state: "all", language: "all" };

/**
 * The rows a filter leaves.
 *
 * The search matches anywhere in the title or in a topic's name and ignores
 * case, because a reader types the word they remember rather than how the title
 * begins, and often remembers what a post was about rather than what it was
 * called. A row in the trash is shown only where the reader asked for the trash.
 *
 * @param rows - The whole list.
 * @param filter - What the reader narrowed it to.
 */
export function filterEntries(rows: readonly EntryListItem[], filter: EntryFilter): EntryListItem[] {
  const search = filter.search.trim().toLocaleLowerCase();
  return rows.filter(
    (row) =>
      row.trashed === (filter.state === "trash") &&
      (filter.state === "all" || filter.state === "trash" || row.state === filter.state) &&
      (filter.language === "all" || row.language === filter.language) &&
      (search === "" ||
        row.title.toLocaleLowerCase().includes(search) ||
        row.topics.some((topic) => topic.toLocaleLowerCase().includes(search))),
  );
}

/** The figures above a list, counted from the rows it shows. */
export interface EntryCounts {
  published: number;
  drafts: number;
  hidden: number;
  translated: number;
  total: number;
}

/**
 * The figures above a list.
 *
 * Counted from the rows the table shows, never from a separate query, because a
 * number that describes a different set than the table under it is worse than
 * no number.
 *
 * @param rows - The rows the table shows.
 */
export function countEntries(rows: readonly EntryListItem[]): EntryCounts {
  const counted = (keep: (row: EntryListItem) => boolean) => rows.filter(keep).length;
  return {
    published: counted((row) => row.state === "public"),
    drafts: counted((row) => row.state === "draft"),
    hidden: counted((row) => row.state === "hidden"),
    translated: counted((row) => row.translated),
    total: rows.length,
  };
}

/** The word for each publication state, in the catalogue. */
export const STATE_TEXT: Record<PublicationState, DashboardStringKey> = {
  public: "statePublic",
  draft: "stateDraft",
  hidden: "stateHidden",
};

/** A tone the status colors name, as `data-tone` takes it. */
export type StateTone = "success" | "warning" | "info";

/**
 * The tone each publication state is shown in: its mark in the editor and its
 * figure above a list, so the same state has the same color everywhere.
 */
export const STATE_TONE: Record<PublicationState, StateTone> = {
  public: "success",
  draft: "warning",
  hidden: "info",
};

/** The name of each language, in the interface language. */
export const LANGUAGE_TEXT: Record<ContentLanguage, DashboardStringKey> = {
  en: "languageEn",
  de: "languageDe",
};

/** The other of the site's two languages. */
export function otherLanguage(language: ContentLanguage): ContentLanguage {
  return CONTENT_LANGUAGES.find((other) => other !== language) ?? language;
}
