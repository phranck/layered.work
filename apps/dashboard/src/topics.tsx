import {
  CONTENT_LANGUAGES,
  type ContentLanguage,
  MaxLength,
  type SaveTopicBody,
  saveTopicBody,
  type TopicListItem,
} from "@layered/schemas";
import { Button, Card, Field, Input, Select } from "@layered/ui";
import {
  ArrowsMergeIcon,
  FloppyDiskIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  TrashIcon,
  XIcon,
} from "@layered/ui/icons";
import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type KeyboardEvent, useMemo, useState } from "react";
import { DashboardApiError } from "./api.js";
import { ScreenTitle } from "./app-bar-slots.js";
import { useDashboardApi } from "./dashboard-context.js";
import type { DashboardStringKey } from "./dashboard-i18n.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import { CardDialog } from "./modal.js";
import { useNotify } from "./notifications.js";
import type { DashboardArea } from "./routes.js";
import { SearchShortcutCap, useSearchField } from "./search.js";
import { useTextLanguage } from "./text-language.js";
import { Translated } from "./translated.js";

/**
 * The topics screen: every topic with its name in the language the switch has
 * chosen and how many entries have it, where a topic is renamed, merged into
 * another or deleted.
 *
 * A language a topic has no name in shows as missing rather than borrowing the
 * other language's name, because this is the screen where the gap gets filled.
 */

/** The query the topic list is cached under, shared with the editor's topic field. */
export const topicListKey = ["topics"] as const;

/**
 * What a topic is called in one language, or in the other where it has no name
 * in that one, and whether the name is its own.
 *
 * @param topic - The topic.
 * @param language - The language wanted.
 */
export function topicLabel(
  topic: TopicListItem,
  language: ContentLanguage,
): { name: string; named: boolean } {
  const own = topic[language];
  if (own) return { name: own.name, named: true };
  return { name: (topic.en ?? topic.de)?.name ?? "", named: false };
}

/**
 * The topics a search leaves: those with the text anywhere in either name or
 * address, ignoring case.
 *
 * @param topics - Every topic.
 * @param search - What the reader typed.
 */
export function filterTopics(topics: readonly TopicListItem[], search: string): TopicListItem[] {
  const needle = search.trim().toLocaleLowerCase();
  if (!needle) return [...topics];
  return topics.filter((topic) =>
    CONTENT_LANGUAGES.some((language) => {
      const named = topic[language];
      return (
        named !== null && (named.name.toLocaleLowerCase().includes(needle) || named.slug.includes(needle))
      );
    }),
  );
}

/** Refreshes everything a change to a topic shows up in. */
function refreshAfterTopicChange(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: topicListKey });
  void queryClient.invalidateQueries({ queryKey: ["entries"] });
  void queryClient.invalidateQueries({ queryKey: ["entry"] });
  void queryClient.invalidateQueries({ queryKey: ["dashboard-counts"] });
}

/** Which dialog is open, and for which topic. */
type OpenDialog = { kind: "edit" | "merge" | "delete"; topic: TopicListItem } | null;

/**
 * The list of topics, in a card with a search, and the dialogs that change one.
 *
 * @param area - The sidebar area, which names the screen.
 */
export function TopicsScreen({ area }: { area: DashboardArea }) {
  const api = useDashboardApi();
  const { language, text } = useDashboardLanguage();
  const list = useQuery({ queryKey: topicListKey, queryFn: api.fetchTopics });
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const rows = useMemo(() => filterTopics(list.data ?? [], search), [list.data, search]);
  const { fieldRef, returnFocus } = useSearchField();
  const title = text(area.labelKey);
  // A topic is named in the interface's language where it can be, because that
  // is the language the reader is working in.
  const interfaceLanguage: ContentLanguage = language;

  const onFieldKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    returnFocus();
  };

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
                <label className="search-field">
                  <MagnifyingGlassIcon aria-hidden="true" />
                  <input
                    ref={fieldRef}
                    className="input"
                    type="search"
                    aria-label={text("searchTopics")}
                    placeholder={text("searchTopics")}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onKeyDown={onFieldKeyDown}
                    data-search-field=""
                  />
                  <SearchShortcutCap />
                </label>
                <Translated.Switch />
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
                {list.data.length === 0 ? text("topicsEmpty") : text("topicsNoMatch")}
              </p>
            </Card.Body>
          )}
          {rows.length > 0 && (
            <TopicTable rows={rows} canMerge={(list.data?.length ?? 0) >= 2} onOpen={setDialog} />
          )}
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
 * A topic with no name in that language shows as missing rather than borrowing
 * the other one, because this is where the gap gets filled.
 *
 * @param rows - The topics the search leaves.
 * @param canMerge - Whether there is another topic to merge into.
 * @param onOpen - Opens a dialog for one topic.
 */
function TopicTable({
  rows,
  canMerge,
  onOpen,
}: {
  rows: readonly TopicListItem[];
  canMerge: boolean;
  onOpen: (dialog: OpenDialog) => void;
}) {
  const { text } = useDashboardLanguage();
  const language = useTextLanguage();
  return (
    <table className="data-table data-table--static">
      <thead>
        <tr>
          <th>{text("topicName")}</th>
          <th className="col-count align-end">{text("columnEntries")}</th>
          <th className="col-actions align-end">{text("columnAction")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((topic) => {
          const named = topic[language];
          return (
            <tr key={topic.id}>
              <td lang={language}>
                {named ? (
                  <span className="topic-name">
                    <span className="topic-name__name">{named.name}</span>
                    <span className="topic-name__slug">{named.slug}</span>
                  </span>
                ) : (
                  <span className="badge" data-status="draft">
                    {text("topicNameMissing")}
                  </span>
                )}
              </td>
              <td className="align-end">{topic.entryCount}</td>
              <td>
                <div className="actions">
                  <Button.Icon
                    label={text("editTopic")}
                    icon={<PencilSimpleIcon />}
                    onClick={() => onOpen({ kind: "edit", topic })}
                  />
                  <Button.Icon
                    label={text("mergeTopic")}
                    icon={<ArrowsMergeIcon />}
                    disabled={!canMerge}
                    onClick={() => onOpen({ kind: "merge", topic })}
                  />
                  <Button.Icon
                    label={text("deleteTopic")}
                    icon={<TrashIcon />}
                    onClick={() => onOpen({ kind: "delete", topic })}
                  />
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** The two fields of one language, as typed. */
type NameDraft = { name: string; slug: string };

/**
 * The typed fields as the body a save sends, or the reason they cannot be.
 *
 * Both fields of a language empty means the topic has no name in it; one of the
 * two empty is a mistake rather than a choice. Everything else is checked by the
 * same schema the API validates with.
 *
 * @param draft - Both languages as typed.
 */
export function topicBodyOf(
  draft: Record<ContentLanguage, NameDraft>,
): { value: SaveTopicBody } | { problem: DashboardStringKey } {
  const sides: Partial<Record<ContentLanguage, NameDraft | null>> = {};
  for (const language of CONTENT_LANGUAGES) {
    const name = draft[language].name.trim();
    const slug = draft[language].slug.trim();
    if (!name && !slug) sides[language] = null;
    else if (!name || !slug) return { problem: "topicIncomplete" };
    else sides[language] = { name, slug };
  }
  const parsed = saveTopicBody.safeParse(sides);
  if (parsed.success) return { value: parsed.data };
  const onSlug = parsed.error.issues.some((issue) => issue.path.at(-1) === "slug");
  return { problem: onSlug ? "topicSlugInvalid" : "topicNeedsName" };
}

/** A topic's names and addresses in both languages, with a save. */
function TopicEditDialog({ topic, onClose }: { topic: TopicListItem; onClose: () => void }) {
  const api = useDashboardApi();
  const queryClient = useQueryClient();
  const { text } = useDashboardLanguage();
  const { notify, notifyError } = useNotify();
  const [draft, setDraft] = useState<Record<ContentLanguage, NameDraft>>({
    en: { name: topic.en?.name ?? "", slug: topic.en?.slug ?? "" },
    de: { name: topic.de?.name ?? "", slug: topic.de?.slug ?? "" },
  });
  const [problem, setProblem] = useState<DashboardStringKey>();
  const save = useMutation({
    mutationFn: (value: SaveTopicBody) => api.saveTopic(topic.id, value),
    onError: (error) => {
      if (error instanceof DashboardApiError && error.code === "conflict") setProblem("topicSlugTaken");
      else notifyError(error);
    },
    onSuccess: () => {
      refreshAfterTopicChange(queryClient);
      notify({ tone: "success", message: text("saved") });
      onClose();
    },
  });

  const update = (language: ContentLanguage, change: Partial<NameDraft>) => {
    setDraft((current) => ({ ...current, [language]: { ...current[language], ...change } }));
    setProblem(undefined);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const outcome = topicBodyOf(draft);
    if ("problem" in outcome) setProblem(outcome.problem);
    else save.mutate(outcome.value);
  };

  return (
    <Translated>
      <CardDialog labelId="topic-edit-title" onClose={onClose}>
        <Card.Header id="topic-edit-title" title={text("topicEditTitle")} actions={<Translated.Switch />} />
        <Card.Body>
          <form id="topic-edit-form" className="settings-form" onSubmit={submit} noValidate>
            <TopicNameFields draft={draft} onChange={update} />
            {problem && (
              <p className="dashboard-error" role="alert">
                {text(problem)}
              </p>
            )}
          </form>
        </Card.Body>
        <Card.Footer
          actions={
            <>
              <Button icon={<XIcon />} onClick={onClose}>
                {text("cancel")}
              </Button>
              <Button
                type="submit"
                form="topic-edit-form"
                tone="primary"
                disabled={save.isPending}
                icon={<FloppyDiskIcon />}
              >
                {save.isPending ? text("savePending") : text("save")}
              </Button>
            </>
          }
        />
      </CardDialog>
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
    <div className="settings-form__pair">
      <Field label={text("topicName")} htmlFor={`topic-name-${language}`} hint={text("topicLanguageHint")}>
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
          className="settings-form__code"
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
  const api = useDashboardApi();
  const queryClient = useQueryClient();
  const { text } = useDashboardLanguage();
  const { notify, notifyError } = useNotify();
  const [into, setInto] = useState(others[0]?.id ?? "");
  const name = topicLabel(topic, language).name;
  const merge = useMutation({
    mutationFn: () => api.mergeTopic(topic.id, into),
    onError: (error) => notifyError(error),
    onSuccess: () => {
      refreshAfterTopicChange(queryClient);
      notify({ tone: "success", message: text("topicMerged") });
      onClose();
    },
  });
  return (
    <CardDialog labelId="topic-merge-title" onClose={onClose}>
      <Card.Header id="topic-merge-title" title={text("topicMergeTitle", name)} />
      <Card.Body className="settings-form">
        <p>{text("topicMergeBody", topic.entryCount, name)}</p>
        <Field label={text("topicMergeInto")} htmlFor="topic-merge-into">
          <Select
            id="topic-merge-into"
            value={into}
            onChange={(event) => setInto(event.target.value)}
            options={others.map((other) => ({ value: other.id, label: topicLabel(other, language).name }))}
          />
        </Field>
      </Card.Body>
      <Card.Footer
        actions={
          <>
            <Button icon={<XIcon />} onClick={onClose}>
              {text("cancel")}
            </Button>
            <Button
              tone="primary"
              icon={<ArrowsMergeIcon />}
              disabled={!into || merge.isPending}
              onClick={() => merge.mutate()}
            >
              {merge.isPending ? text("topicMergePending") : text("mergeTopic")}
            </Button>
          </>
        }
      />
    </CardDialog>
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
  const api = useDashboardApi();
  const queryClient = useQueryClient();
  const { text } = useDashboardLanguage();
  const { notify, notifyError } = useNotify();
  const remove = useMutation({
    mutationFn: () => api.deleteTopic(topic.id),
    onError: (error) => notifyError(error),
    onSuccess: () => {
      refreshAfterTopicChange(queryClient);
      notify({ tone: "success", message: text("topicDeleted") });
      onClose();
    },
  });
  return (
    <CardDialog labelId="topic-delete-title" onClose={onClose}>
      <Card.Header id="topic-delete-title" title={text("topicDeleteTitle", name)} />
      <Card.Body>
        <p>{text("topicDeleteBody", topic.entryCount)}</p>
      </Card.Body>
      <Card.Footer
        actions={
          <>
            <Button icon={<XIcon />} onClick={onClose} autoFocus>
              {text("cancel")}
            </Button>
            <Button
              tone="danger"
              icon={<TrashIcon />}
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              {remove.isPending ? text("topicDeletePending") : text("deleteTopic")}
            </Button>
          </>
        }
      />
    </CardDialog>
  );
}
