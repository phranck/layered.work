import {
  type ContentLanguage,
  type EntryKind,
  type EntryListItem,
  PUBLICATION_STATES,
  type PublicationState,
} from "@layered/schemas";
import { Button, Card, Row, Segmented, Select } from "@layered/ui";
import {
  ArrowCounterClockwiseIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
} from "@layered/ui/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type KeyboardEvent, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { HeaderEnd, ScreenTitle } from "./app-bar-slots.js";
import { useDashboardApi } from "./dashboard-context.js";
import type { DashboardStringKey } from "./dashboard-i18n.js";
import { entryKey } from "./entry-query.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import { ListingSettingsCard } from "./listing-settings.js";
import { ConfirmDialog } from "./modal.js";
import { useNotify } from "./notifications.js";
import type { DashboardArea } from "./routes.js";
import { SearchShortcutCap, useSearchField } from "./search.js";
import { contentLanguageOptions } from "./translated.js";

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
const OPEN_FILTER: EntryFilter = { search: "", state: "all", language: "all" };

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
const STATE_TEXT: Record<PublicationState, DashboardStringKey> = {
  public: "statePublic",
  draft: "stateDraft",
  hidden: "stateHidden",
};

/** A tone the status colours name, as `data-tone` takes it. */
export type StateTone = "success" | "warning" | "info";

/**
 * The tone each publication state is shown in: its mark in the editor and its
 * figure above a list, so the same state has the same colour everywhere.
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
  return language === "en" ? "de" : "en";
}

/** The query key every entry list is cached under, so a later screen can read or refresh it. */
export const entryListKey = (kind: EntryKind) => ["entries", kind] as const;

/**
 * One of the figures above a list: a label, the number, and what it means.
 *
 * The number is right-aligned in a tabular face, because it is read against the
 * number in the next card.
 */
function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: number;
  note: string;
  tone?: StateTone;
}) {
  return (
    <Card className="stat" data-tone={tone}>
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
  const queryClient = useQueryClient();
  const { notify, notifyError } = useNotify();
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

  // Restoring and emptying both change what every list and the sidebar's
  // counts show, so both refresh all of them.
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["entries"] });
    void queryClient.invalidateQueries({ queryKey: ["entry"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard-counts"] });
  };
  const create = useMutation({
    mutationFn: () => api.createEntry({ kind, title: text("editorTitleMissing") }),
    onError: (error) => notifyError(error),
    onSuccess: (created) => {
      queryClient.setQueryData(entryKey(created.id), created);
      refresh();
      navigate(`/${area.path}/${created.id}`, { state: { focusTitle: true } });
    },
  });
  const restore = useMutation({
    mutationFn: (id: string) => api.setTrashed(id, false),
    onError: (error) => notifyError(error),
    onSuccess: () => {
      refresh();
      notify({ tone: "success", message: text("restored") });
    },
  });
  const [emptying, setEmptying] = useState(false);
  const empty = useMutation({
    mutationFn: () => api.emptyTrash(kind),
    onSuccess: ({ deleted }) => {
      refresh();
      setEmptying(false);
      notify({ tone: "success", message: text("trashEmptied", deleted) });
    },
  });

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
      <ScreenTitle title={title} />
      <HeaderEnd>
        <Button
          tone="primary"
          icon={<PlusIcon />}
          disabled={create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? text("newEntryPending") : text("newEntry")}
        </Button>
      </HeaderEnd>
      <div className="stat-row">
        <Stat
          label={text("statPublished")}
          value={counts.published}
          note={text("statPublishedNote")}
          tone={STATE_TONE.public}
        />
        <Stat
          label={text("statDrafts")}
          value={counts.drafts}
          note={text("statDraftsNote")}
          tone={STATE_TONE.draft}
        />
        <Stat
          label={text("statHidden")}
          value={counts.hidden}
          note={text("statHiddenNote")}
          tone={STATE_TONE.hidden}
        />
        <Stat
          label={text("statTranslated")}
          value={counts.translated}
          note={text("statTranslatedNote", counts.total)}
        />
      </div>
      {/* Pages have no overview on the site, so there is nothing to set up. */}
      {kind !== "page" && <ListingSettingsCard kind={kind} />}
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
                  { value: "trash", label: text("filterTrash") },
                ]}
              />
              <Segmented
                aria-label={text("filterLanguage")}
                value={filter.language}
                onValueChange={(value) =>
                  setFilter((current) => ({ ...current, language: value as EntryFilter["language"] }))
                }
                options={[{ value: "all", label: text("filterAll") }, ...contentLanguageOptions()]}
              />
              {filter.state === "trash" && rows.length > 0 && (
                <Button tone="danger" icon={<TrashIcon />} onClick={() => setEmptying(true)}>
                  {text("emptyTrash")}
                </Button>
              )}
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
              {filter.state === "trash" && !filter.search.trim()
                ? text("trashEmpty")
                : list.data.length === 0
                  ? text("entriesEmpty")
                  : text("entriesNoMatch")}
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
                    <span className="badge" data-status={row.trashed ? "trashed" : row.state}>
                      {row.trashed ? text("stateTrashed") : text(STATE_TEXT[row.state])}
                    </span>
                  </td>
                  <td>
                    <span className="lang-tags">
                      <span className="lang-tag" data-language={row.language} lang={row.language}>
                        {row.language}
                      </span>
                      {row.translated && (
                        <span
                          className="lang-tag lang-tag--counterpart"
                          data-language={otherLanguage(row.language)}
                          title={text("alsoIn", text(LANGUAGE_TEXT[otherLanguage(row.language)]))}
                        >
                          {otherLanguage(row.language)}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="align-end">
                    <time dateTime={row.date}>{dates.format(new Date(row.date))}</time>
                  </td>
                  <td>
                    <div className="actions">
                      {row.trashed ? (
                        <Button.Icon
                          label={text("restore")}
                          icon={<ArrowCounterClockwiseIcon />}
                          disabled={restore.isPending}
                          onClick={(event) => {
                            event.stopPropagation();
                            restore.mutate(row.id);
                          }}
                        />
                      ) : (
                        <Button.Icon
                          label={text("editEntry")}
                          icon={<PencilSimpleIcon weight="duotone" />}
                          tabIndex={-1}
                          onClick={(event) => {
                            event.stopPropagation();
                            open(row);
                          }}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {emptying && (
        <ConfirmDialog
          title={text("emptyTrashTitle")}
          confirm={empty.isPending ? text("emptyTrashPending") : text("emptyTrash")}
          busy={empty.isPending}
          error={empty.error}
          onConfirm={() => empty.mutate()}
          onClose={() => setEmptying(false)}
        >
          <p>{text("emptyTrashBody", rows.length)}</p>
        </ConfirmDialog>
      )}
    </>
  );
}
