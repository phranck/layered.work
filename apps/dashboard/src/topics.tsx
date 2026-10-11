import { type ContentLanguage, MaxLength, type TopicListItem } from "@layered/schemas";
import { Badge, Card, Field, Input, Select } from "@layered/ui";
import { useMemo, useState } from "react";
import { ActionButton } from "./action-button.js";
import { DashboardApiError } from "./api.js";
import { ScreenTitle } from "./app-bar-slots.js";
import type { DashboardStringKey } from "./dashboard-i18n.js";
import { useDashboardLanguage } from "./language-context.js";
import { ConfirmDialog, FormDialog } from "./modal.js";
import { useNotify } from "./notifications.js";
import { EmptyState, noRows, QueryStates } from "./query-states.js";
import type { DashboardArea } from "./routes.js";
import { Table, useTableSearch } from "./table.js";
import { useTextLanguage } from "./text-language.js";
import { filterTopics, type NameDraft, nameDraftOf, topicBodyOf, topicLabel } from "./topics-model.js";
import { useDeleteTopic, useMergeTopic, useSaveTopic, useTopics } from "./topics-query.js";
import { Translated } from "./translated.js";

/**
 * The topics screen: every topic with its name in the language the switch has
 * chosen and how many entries have it, where a topic is renamed, merged into
 * another or deleted.
 *
 * A language a topic has no name in shows as missing rather than borrowing the
 * other language's name, because this is the screen where the gap gets filled.
 */

/** Which dialog is open, and for which topic. */
type OpenDialog = { kind: "edit" | "merge" | "delete"; topic: TopicListItem } | null;

/**
 * The list of topics, in a card with a search, and the dialogs that change one.
 *
 * @param area - The sidebar area, which names the screen.
 */
export function TopicsScreen({ area }: { area: DashboardArea }) {
  const { language, text } = useDashboardLanguage();
  const list = useTopics();
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const rows = useMemo(() => filterTopics(list.data ?? [], search), [list.data, search]);
  const field = useTableSearch();
  const title = text(area.labelKey);
  // A topic is named in the interface's language where it can be, because that
  // is the language the reader is working in.
  const interfaceLanguage: ContentLanguage = language;

  return (
    <>
      <ScreenTitle title={title} />
      <Translated>
        <Card>
          <Card.Header
            title={title}
            meta={list.data?.length}
            actions={
              <>
                <Table.Search
                  label={text("searchTopics")}
                  value={search}
                  onChange={setSearch}
                  search={field}
                />
                <Translated.Switch />
              </>
            }
          />
          <QueryStates query={list} empty={text("topicsEmpty")} isEmpty={noRows}>
            {(topics) =>
              rows.length === 0 ? (
                <EmptyState>{text("topicsNoMatch")}</EmptyState>
              ) : (
                <TopicTable rows={rows} canMerge={topics.length >= 2} onOpen={setDialog} search={field} />
              )
            }
          </QueryStates>
        </Card>
      </Translated>
      {dialog?.kind === "edit" && <TopicEditDialog topic={dialog.topic} onClose={() => setDialog(null)} />}
      {dialog?.kind === "merge" && list.data && (
        <TopicMergeDialog
          topic={dialog.topic}
          others={list.data.filter((other) => other.id !== dialog.topic.id)}
          language={interfaceLanguage}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "delete" && (
        <TopicDeleteDialog
          topic={dialog.topic}
          name={topicLabel(dialog.topic, interfaceLanguage).name}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}

/**
 * The topics as a table, named in the language the card's switch has chosen.
 *
 * A row opens the topic for editing, as a row of Posts opens the entry, and the
 * pencil at its end stays as the visible sign of that. A topic with no name in
 * that language shows as missing rather than borrowing the other one, because
 * this is where the gap gets filled.
 *
 * @param rows - The topics the search leaves.
 * @param canMerge - Whether there is another topic to merge into.
 * @param onOpen - Opens a dialog for one topic.
 * @param search - The search field above, which the arrow keys walk between.
 */
function TopicTable({
  rows,
  canMerge,
  onOpen,
  search,
}: {
  rows: readonly TopicListItem[];
  canMerge: boolean;
  onOpen: (dialog: OpenDialog) => void;
  search: ReturnType<typeof useTableSearch>;
}) {
  const { text } = useDashboardLanguage();
  const language = useTextLanguage();
  return (
    <Table
      bodyRef={search.bodyRef}
      onLeaveTop={search.onLeaveTop}
      columns={[
        { kind: "title", label: text("topicName") },
        { kind: "text", label: text("topicSlug") },
        { kind: "count", label: text("columnEntries") },
        { kind: "action", label: text("columnAction"), actions: 3 },
      ]}
    >
      {rows.map((topic) => {
        const named = topic[language];
        return (
          <Table.Row key={topic.id} onOpen={() => onOpen({ kind: "edit", topic })}>
            <Table.Cell kind="title" lang={language}>
              {named ? (
                <Table.Title title={named.name} />
              ) : (
                <Badge tone="warning">{text("topicNameMissing")}</Badge>
              )}
            </Table.Cell>
            <Table.Cell>{named?.slug}</Table.Cell>
            <Table.Cell kind="count">{topic.entryCount}</Table.Cell>
            <Table.Actions>
              <ActionButton.Icon
                action="edit"
                label={text("editTopic")}
                tabIndex={-1}
                onClick={() => onOpen({ kind: "edit", topic })}
              />
              <ActionButton.Icon
                action="merge"
                label={text("mergeTopic")}
                disabled={!canMerge}
                onClick={() => onOpen({ kind: "merge", topic })}
              />
              <ActionButton.Icon
                action="delete"
                label={text("deleteTopic")}
                onClick={() => onOpen({ kind: "delete", topic })}
              />
            </Table.Actions>
          </Table.Row>
        );
      })}
    </Table>
  );
}

/** A topic's names and addresses in both languages, with a save. */
function TopicEditDialog({ topic, onClose }: { topic: TopicListItem; onClose: () => void }) {
  const { text } = useDashboardLanguage();
  const { notify } = useNotify();
  const [draft, setDraft] = useState(() => nameDraftOf(topic));
  const [problem, setProblem] = useState<DashboardStringKey>();
  const save = useSaveTopic(topic, {
    // An address another topic holds is a problem with what was typed, said
    // where the other checks of the typed fields are said.
    onError: (error) => {
      if (error instanceof DashboardApiError && error.code === "conflict") setProblem("topicSlugTaken");
    },
    onSuccess: () => {
      notify({ tone: "success", message: text("saved") });
      onClose();
    },
  });
  const takenSlug = save.error instanceof DashboardApiError && save.error.code === "conflict";

  const update = (language: ContentLanguage, change: Partial<NameDraft>) => {
    setDraft((current) => ({ ...current, [language]: { ...current[language], ...change } }));
    setProblem(undefined);
  };
  const submit = () => {
    const outcome = topicBodyOf(draft);
    if ("problem" in outcome) setProblem(outcome.problem);
    else save.mutate(outcome.value);
  };

  return (
    <Translated>
      <FormDialog
        title={text("topicEditTitle")}
        headerActions={<Translated.Switch />}
        onSubmit={submit}
        onClose={onClose}
        busy={save.isPending}
        problem={problem ? text(problem) : null}
        error={takenSlug ? null : save.error}
      >
        <TopicNameFields draft={draft} onChange={update} />
      </FormDialog>
    </Translated>
  );
}

/**
 * A topic's name and address in the language the dialog's switch has chosen.
 *
 * @param draft - Both languages as typed.
 * @param onChange - Changes the fields of one language.
 */
function TopicNameFields({
  draft,
  onChange,
}: {
  draft: Record<ContentLanguage, NameDraft>;
  onChange: (language: ContentLanguage, change: Partial<NameDraft>) => void;
}) {
  const { text } = useDashboardLanguage();
  const language = useTextLanguage();
  return (
    <div className="field-row">
      <Field label={text("topicName")} htmlFor={`topic-name-${language}`}>
        <Input
          id={`topic-name-${language}`}
          lang={language}
          value={draft[language].name}
          maxLength={MaxLength.Line}
          onChange={(event) => onChange(language, { name: event.target.value })}
        />
      </Field>
      <Field label={text("topicSlug")} htmlFor={`topic-slug-${language}`} hint={text("topicSlugHint")}>
        <Input
          id={`topic-slug-${language}`}
          className="input--code"
          value={draft[language].slug}
          maxLength={MaxLength.Handle}
          spellCheck={false}
          onChange={(event) => onChange(language, { slug: event.target.value })}
        />
      </Field>
    </div>
  );
}

/** Choosing the topic another one is merged into, with what that does to its entries. */
function TopicMergeDialog({
  topic,
  others,
  language,
  onClose,
}: {
  topic: TopicListItem;
  others: TopicListItem[];
  language: ContentLanguage;
  onClose: () => void;
}) {
  const { text } = useDashboardLanguage();
  const { notify } = useNotify();
  const [into, setInto] = useState(others[0]?.id ?? "");
  const name = topicLabel(topic, language).name;
  const merge = useMergeTopic(topic, {
    onSuccess: () => {
      notify({ tone: "success", message: text("topicMerged") });
      onClose();
    },
  });
  return (
    <FormDialog
      title={text("topicMergeTitle", name)}
      onSubmit={() => merge.mutate(into)}
      onClose={onClose}
      busy={merge.isPending}
      blocked={!into}
      error={merge.error}
      submit={{
        label: merge.isPending ? text("topicMergePending") : text("mergeTopic"),
        action: "merge",
      }}
    >
      <p>{text("topicMergeBody", topic.entryCount, name)}</p>
      <Field label={text("topicMergeInto")} htmlFor="topic-merge-into">
        <Select
          id="topic-merge-into"
          value={into}
          onChange={(event) => setInto(event.target.value)}
          options={others.map((other) => ({ value: other.id, label: topicLabel(other, language).name }))}
        />
      </Field>
    </FormDialog>
  );
}

/** The question before a topic is deleted, saying how many entries lose it. */
function TopicDeleteDialog({
  topic,
  name,
  onClose,
}: {
  topic: TopicListItem;
  name: string;
  onClose: () => void;
}) {
  const { text } = useDashboardLanguage();
  const { notify } = useNotify();
  const remove = useDeleteTopic(topic, {
    onSuccess: () => {
      notify({ tone: "success", message: text("topicDeleted") });
      onClose();
    },
  });
  return (
    <ConfirmDialog
      title={text("topicDeleteTitle", name)}
      confirm={remove.isPending ? text("topicDeletePending") : text("deleteTopic")}
      busy={remove.isPending}
      error={remove.error}
      onConfirm={() => remove.mutate()}
      onClose={onClose}
    >
      <p>{text("topicDeleteBody", topic.entryCount)}</p>
    </ConfirmDialog>
  );
}
