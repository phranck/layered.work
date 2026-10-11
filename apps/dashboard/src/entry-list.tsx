import { type EntryKind, type EntryListItem, PUBLICATION_STATES } from "@layered/schemas";
import { Button, Card, Segmented, Select } from "@layered/ui";
import { ArrowCounterClockwiseIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from "@layered/ui/icons";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { HeaderEnd, ScreenTitle } from "./app-bar-slots.js";
import {
  countEntries,
  type EntryFilter,
  filterEntries,
  LANGUAGE_TEXT,
  OPEN_FILTER,
  otherLanguage,
  STATE_TEXT,
  STATE_TONE,
  type StateTone,
} from "./entry-model.js";
import { useCreateEntry, useEmptyTrash, useEntryList, useRestoreEntry } from "./entry-query.js";
import { ErrorNotice } from "./error-notice.js";
import { DATE_FORMAT } from "./format.js";
import { useDashboardLanguage } from "./language-context.js";
import { ListingSettingsCard } from "./listing-settings.js";
import { ConfirmDialog } from "./modal.js";
import { useNotify } from "./notifications.js";
import type { DashboardArea } from "./routes.js";
import { Table, useTableSearch } from "./table.js";
import { contentLanguageOptions } from "./translated.js";

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
  const navigate = useNavigate();
  const { notify, notifyError } = useNotify();
  const { language, text } = useDashboardLanguage();
  const [filter, setFilter] = useState<EntryFilter>(OPEN_FILTER);
  const list = useEntryList(kind);
  const rows = useMemo(() => filterEntries(list.data ?? [], filter), [list.data, filter]);
  const counts = countEntries(rows);
  const title = text(area.labelKey);

  const search = useTableSearch();

  const open = (row: EntryListItem) => navigate(`/${area.path}/${row.id}`);

  const create = useCreateEntry(kind, {
    onError: notifyError,
    onSuccess: (created) => navigate(`/${area.path}/${created.id}`, { state: { focusTitle: true } }),
  });
  const restore = useRestoreEntry({
    onError: notifyError,
    onSuccess: () => notify({ tone: "success", message: text("restored") }),
  });
  const [emptying, setEmptying] = useState(false);
  const empty = useEmptyTrash(kind, {
    onSuccess: ({ deleted }) => {
      setEmptying(false);
      notify({ tone: "success", message: text("trashEmptied", deleted) });
    },
  });

  return (
    <>
      <ScreenTitle title={title} />
      <HeaderEnd>
        <Button
          tone="primary"
          icon={<PlusIcon />}
          disabled={create.isPending}
          onClick={() => create.mutate(text("editorTitleMissing"))}
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
              <Table.Search
                label={text("searchTitles")}
                value={filter.search}
                onChange={(value) => setFilter((current) => ({ ...current, search: value }))}
                search={search}
              />
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
          <Table.Empty>
            {filter.state === "trash" && !filter.search.trim()
              ? text("trashEmpty")
              : list.data.length === 0
                ? text("entriesEmpty")
                : text("entriesNoMatch")}
          </Table.Empty>
        )}
        {rows.length > 0 && (
          <Table
            bodyRef={search.bodyRef}
            onLeaveTop={search.onLeaveTop}
            columns={[
              { kind: "title", label: text("columnTitle") },
              { kind: "state", label: text("columnState") },
              { kind: "language", label: text("columnLanguage") },
              { kind: "date", label: text("columnDate") },
              { kind: "action", label: text("columnAction") },
            ]}
          >
            {rows.map((row) => (
              <Table.Row key={row.id} onOpen={() => open(row)}>
                <Table.Cell kind="title">
                  <Table.Title title={row.title} thumbnail={row.thumbnailUrl} />
                </Table.Cell>
                <Table.Cell kind="state">
                  <Table.Badge tone={row.trashed ? "danger" : STATE_TONE[row.state]}>
                    {row.trashed ? text("stateTrashed") : text(STATE_TEXT[row.state])}
                  </Table.Badge>
                </Table.Cell>
                <Table.Cell kind="language">
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
                </Table.Cell>
                <Table.Cell kind="date">
                  <time dateTime={row.date}>{DATE_FORMAT[language].format(new Date(row.date))}</time>
                </Table.Cell>
                <Table.Actions>
                  {row.trashed ? (
                    <Button.Icon
                      label={text("restore")}
                      icon={<ArrowCounterClockwiseIcon />}
                      disabled={restore.isPending}
                      onClick={() => restore.mutate(row.id)}
                    />
                  ) : (
                    <Button.Icon
                      label={text("editEntry")}
                      icon={<PencilSimpleIcon />}
                      tabIndex={-1}
                      onClick={() => open(row)}
                    />
                  )}
                </Table.Actions>
              </Table.Row>
            ))}
          </Table>
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
