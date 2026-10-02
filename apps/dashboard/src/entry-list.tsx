import {
  type ContentLanguage,
  type EntryKind,
  type EntryListItem,
  PUBLICATION_STATES,
  type PublicationState,
} from "@layered/schemas";
import { Button, Card, Row, Section, Segmented, Select } from "@layered/ui";
import { MagnifyingGlassIcon, PencilSimpleIcon } from "@layered/ui/icons";
import { useQuery } from "@tanstack/react-query";
import { type KeyboardEvent, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useDashboardApi } from "./dashboard-context.js";
import type { DashboardStringKey } from "./dashboard-i18n.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import type { DashboardArea } from "./routes.js";
import { SearchShortcutCap, useSearchField } from "./search.js";

/** What the reader narrowed the list to. `all` leaves that dimension open. */
export interface EntryFilter {
  search: string;
  state: PublicationState | "all";
  language: ContentLanguage | "all";
}

/** The filter a list opens with, which shows everything. */
const OPEN_FILTER: EntryFilter = { search: "", state: "all", language: "all" };

/**
 * The rows a filter leaves.
 *
 * The search matches anywhere in the title or in a topic's name and ignores
 * case, because a reader types the word they remember rather than how the title
 * begins, and often remembers what a post was about rather than what it was
 * called.
 *
 * @param rows - The whole list.
 * @param filter - What the reader narrowed it to.
 */
export function filterEntries(rows: readonly EntryListItem[], filter: EntryFilter): EntryListItem[] {
  const search = filter.search.trim().toLocaleLowerCase();
  return rows.filter(
    (row) =>
      (filter.state === "all" || row.state === filter.state) &&
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
const STATE_TEXT: Record<PublicationState, DashboardStringKey> = {
  public: "statePublic",
  draft: "stateDraft",
  hidden: "stateHidden",
};

/** The query key every entry list is cached under, so a later screen can read or refresh it. */
export const entryListKey = (kind: EntryKind) => ["entries", kind] as const;

/**
 * One of the figures above a list: a label, the number, and what it means.
 *
 * The number is right-aligned in a tabular face, because it is read against the
 * number in the next card.
 */
function Stat({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <Card className="stat">
      <span className="stat__label">{label}</span>
      <span className="stat__value">{value}</span>
      <span className="stat__note">{note}</span>
    </Card>
  );
}

/**
 * An entry list: the figures, then a table of every translation of one kind.
 *
 * Posts, pages and projects are this one screen with a different `kind`,
 * because they differ in what they are and in nothing about how they are
 * listed. A row is the way into the entry, so the whole row is the target, by
 * pointer and by keyboard, and the pencil at its end stays as the visible sign
 * of that.
 *
 * @param area - The sidebar area this list belongs to, which names it and
 *   decides the address a row opens.
 * @param kind - Which entries it lists.
 */
export function EntryListScreen({ area, kind }: { area: DashboardArea; kind: EntryKind }) {
  const api = useDashboardApi();
  const navigate = useNavigate();
  const { language, text } = useDashboardLanguage();
  const [filter, setFilter] = useState<EntryFilter>(OPEN_FILTER);
  const list = useQuery({ queryKey: entryListKey(kind), queryFn: () => api.fetchEntries(kind) });

  // One formatter per language rather than one per row and render.
  const dates = useMemo(() => new Intl.DateTimeFormat(language, { dateStyle: "medium" }), [language]);
  const rows = useMemo(() => filterEntries(list.data ?? [], filter), [list.data, filter]);
  const counts = countEntries(rows);
  const title = text(area.labelKey);

  const { fieldRef, returnFocus } = useSearchField();
  const field = useRef<HTMLInputElement | null>(null);
  const body = useRef<HTMLTableSectionElement>(null);

  const open = (row: EntryListItem) => navigate(`/${area.path}/${row.id}`);

  // The rows are the search's results, so the arrow keys walk from the field
  // into them and between them, and back up into the field from the first.
  const onFieldKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      const first = body.current?.querySelector<HTMLElement>("tr");
      if (!first) return;
      event.preventDefault();
      first.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      returnFocus();
    }
  };
  const onRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, row: EntryListItem) => {
    if (event.target !== event.currentTarget) return;
    const current = event.currentTarget;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open(row);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = event.key === "ArrowDown" ? current.nextElementSibling : current.previousElementSibling;
      if (next instanceof HTMLElement) next.focus();
      else if (event.key === "ArrowUp") field.current?.focus();
    }
  };

  return (
    <>
      <Section.Title title={title} level={1} />
      <div className="stat-row">
        <Stat label={text("statPublished")} value={counts.published} note={text("statPublishedNote")} />
        <Stat label={text("statDrafts")} value={counts.drafts} note={text("statDraftsNote")} />
        <Stat label={text("statHidden")} value={counts.hidden} note={text("statHiddenNote")} />
        <Stat
          label={text("statTranslated")}
          value={counts.translated}
          note={text("statTranslatedNote", counts.total)}
        />
      </div>
      <Card>
        <Card.Header
          title={title}
          meta={counts.total}
          actions={
            <>
              <label className="search-field">
                <MagnifyingGlassIcon aria-hidden="true" />
                <input
                  ref={(element) => {
                    field.current = element;
                    fieldRef(element);
                  }}
                  className="input"
                  type="search"
                  aria-label={text("searchTitles")}
                  placeholder={text("searchTitles")}
                  value={filter.search}
                  onChange={(event) => setFilter((current) => ({ ...current, search: event.target.value }))}
                  onKeyDown={onFieldKeyDown}
                  data-search-field=""
                />
                <SearchShortcutCap />
              </label>
              <Select
                aria-label={text("filterState")}
                value={filter.state}
                onChange={(event) =>
                  setFilter((current) => ({ ...current, state: event.target.value as EntryFilter["state"] }))
                }
                options={[
                  { value: "all", label: text("filterAll") },
                  ...PUBLICATION_STATES.map((state) => ({ value: state, label: text(STATE_TEXT[state]) })),
                ]}
              />
              <Segmented
                aria-label={text("filterLanguage")}
                value={filter.language}
                onValueChange={(value) =>
                  setFilter((current) => ({ ...current, language: value as EntryFilter["language"] }))
                }
                options={[
                  { value: "all", label: text("filterAll") },
                  { value: "en", label: "EN" },
                  { value: "de", label: "DE" },
                ]}
              />
            </>
          }
        />
        {list.isError && (
          <Card.Body>
            <ErrorNotice error={list.error} />
          </Card.Body>
        )}
        {list.isSuccess && rows.length === 0 && (
          <Card.Body>
            <p className="unfinished">
              {list.data.length === 0 ? text("entriesEmpty") : text("entriesNoMatch")}
            </p>
          </Card.Body>
        )}
        {rows.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th className="col-title">{text("columnTitle")}</th>
                <th className="col-state">{text("columnState")}</th>
                <th className="col-language">{text("columnLanguage")}</th>
                <th className="col-date align-end">{text("columnDate")}</th>
                <th className="col-action align-end">{text("columnAction")}</th>
              </tr>
            </thead>
            <tbody ref={body}>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  tabIndex={0}
                  onClick={() => open(row)}
                  onKeyDown={(event) => onRowKeyDown(event, row)}
                >
                  <td>
                    <Row.Bare>
                      <Row.Tile aria-hidden="true">
                        {row.thumbnailUrl && <img src={row.thumbnailUrl} alt="" loading="lazy" />}
                      </Row.Tile>
                      <Row.Text title={row.title} />
                    </Row.Bare>
                  </td>
                  <td>
                    <span className="badge" data-status={row.state}>
                      {text(STATE_TEXT[row.state])}
                    </span>
                  </td>
                  <td>
                    <span className="lang-tag" data-language={row.language} lang={row.language}>
                      {row.language}
                    </span>
                  </td>
                  <td className="align-end">
                    <time dateTime={row.date}>{dates.format(new Date(row.date))}</time>
                  </td>
                  <td>
                    <div className="actions">
                      <Button.Icon
                        label={text("editEntry")}
                        icon={<PencilSimpleIcon weight="duotone" />}
                        tabIndex={-1}
                        onClick={(event) => {
                          event.stopPropagation();
                          open(row);
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

/**
 * Where a row of the list leads until the entry editor exists.
 *
 * It names the entry, so the reader can see that the row they chose is the one
 * that opened, and says plainly that editing is still to come.
 */
export function EntryScreen({ area, kind }: { area: DashboardArea; kind: EntryKind }) {
  const { id } = useParams();
  const api = useDashboardApi();
  const { text } = useDashboardLanguage();
  const list = useQuery({ queryKey: entryListKey(kind), queryFn: () => api.fetchEntries(kind) });
  const entry = list.data?.find((row) => row.id === id);
  return (
    <Section>
      <Section.Title
        eyebrow={text(area.labelKey)}
        title={entry?.title ?? (list.isSuccess ? text("entryNotFound") : "")}
        level={1}
      />
      <Section.Body>
        {list.isError && <ErrorNotice error={list.error} />}
        {list.isSuccess && (
          <p className="unfinished">{entry ? text("unfinished") : text("entryNotFoundBody")}</p>
        )}
      </Section.Body>
    </Section>
  );
}
