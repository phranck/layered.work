import { type ContentLanguage, MAX_TOPICS_PER_ENTRY, MaxLength, type TopicListItem } from "@layered/schemas";
import { Input, Row, RowList } from "@layered/ui";
import { PlusIcon, TagIcon, XIcon } from "@layered/ui/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { useDashboardApi } from "./dashboard-context.js";
import { LANGUAGE_TEXT, otherLanguage } from "./entry-list.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import { useNotify } from "./notifications.js";
import { topicLabel, topicListKey } from "./topics.js";

/**
 * An entry's topics in the editor panel: a chip per topic with a button that
 * removes it, and a field that completes topics as they are typed.
 *
 * The field offers the topics whose name in either language contains what was
 * typed, and a line that creates a new one under that name where no topic has
 * it yet, so a topic is made without leaving the text. The change belongs to
 * the draft and is saved with the entry.
 */

/** How many suggestions the list under the field shows at once. */
const MAX_SUGGESTIONS = 8;

/** One line of the list under the field: an existing topic, or the new one the typed name makes. */
type Suggestion = { kind: "topic"; topic: TopicListItem } | { kind: "create"; name: string };

/**
 * What the list under the field offers for a typed text.
 *
 * Topics already chosen are left out. A new topic is offered unless one has
 * exactly that name in the entry's language, ignoring case.
 *
 * @param topics - Every topic.
 * @param chosen - The ids the entry has.
 * @param typed - What is in the field.
 * @param language - The entry's language, which a new topic is named in.
 */
export function topicSuggestions(
  topics: readonly TopicListItem[],
  chosen: readonly string[],
  typed: string,
  language: ContentLanguage,
): Suggestion[] {
  const needle = typed.trim().toLocaleLowerCase();
  if (!needle) return [];
  const matches = topics
    .filter((topic) => !chosen.includes(topic.id))
    .filter((topic) =>
      [topic.en?.name, topic.de?.name].some((name) => name?.toLocaleLowerCase().includes(needle)),
    )
    .slice(0, MAX_SUGGESTIONS)
    .map((topic): Suggestion => ({ kind: "topic", topic }));
  const exists = topics.some((topic) => topic[language]?.name.toLocaleLowerCase() === needle);
  return exists ? matches : [...matches, { kind: "create", name: typed.trim() }];
}

/**
 * @param language - The entry's language, which names the chips and a new topic.
 * @param value - The ids of the topics the draft has.
 * @param onChange - Replaces them.
 * @param inputId - The id the field's label points at.
 */
export function TopicField({
  language,
  value,
  onChange,
  inputId,
}: {
  language: ContentLanguage;
  value: readonly string[];
  onChange: (topicIds: string[]) => void;
  inputId: string;
}) {
  const api = useDashboardApi();
  const queryClient = useQueryClient();
  const { text } = useDashboardLanguage();
  const { notifyError } = useNotify();
  const listId = useId();
  const topics = useQuery({ queryKey: topicListKey, queryFn: api.fetchTopics });
  const [typed, setTyped] = useState("");
  const [active, setActive] = useState(0);

  const all = topics.data ?? [];
  const chosen = value
    .map((id) => all.find((topic) => topic.id === id))
    .filter((topic) => topic !== undefined);
  const suggestions = topicSuggestions(all, value, typed, language);
  const activeIndex = Math.min(active, suggestions.length - 1);
  const full = value.length >= MAX_TOPICS_PER_ENTRY;

  const add = (id: string) => {
    if (!value.includes(id)) onChange([...value, id]);
    setTyped("");
    setActive(0);
  };
  const create = useMutation({
    mutationFn: (name: string) => api.createTopic({ language, name }),
    onError: (error) => notifyError(error),
    onSuccess: (topic) => {
      queryClient.setQueryData<TopicListItem[]>(topicListKey, (current) =>
        current?.some((item) => item.id === topic.id) ? current : [...(current ?? []), topic],
      );
      add(topic.id);
    },
  });
  const choose = (suggestion: Suggestion) => {
    if (suggestion.kind === "topic") add(suggestion.topic.id);
    else create.mutate(suggestion.name);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (suggestions.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((activeIndex + step + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter") {
      // Enter in this field never submits anything around it.
      event.preventDefault();
      const suggestion = suggestions[activeIndex];
      if (suggestion && !create.isPending) choose(suggestion);
    } else if (event.key === "Escape" && typed) {
      event.preventDefault();
      setTyped("");
    } else if (event.key === "Backspace" && !typed && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  // The panel scrolls by itself, so the list is brought into view as it opens
  // and grows rather than left under the panel's lower edge.
  const list = useRef<HTMLDivElement>(null);
  const shown = suggestions.length;
  useEffect(() => {
    if (shown > 0) list.current?.scrollIntoView?.({ block: "nearest" });
  }, [shown]);

  const optionId = (index: number) => `${listId}-${index}`;
  const languageName = text(LANGUAGE_TEXT[language]);

  return (
    <div className="topic-field">
      {chosen.length > 0 ? (
        <ul className="topic-field__chips">
          {chosen.map((topic) => {
            const { name, named } = topicLabel(topic, language);
            return (
              <li
                key={topic.id}
                className="chip"
                lang={named ? language : otherLanguage(language)}
                data-unnamed={named ? undefined : ""}
                title={named ? undefined : text("editorTopicUnnamed", languageName)}
              >
                {name}
                <button
                  type="button"
                  className="chip__remove"
                  aria-label={text("editorTopicRemove", name)}
                  onClick={() => onChange(value.filter((id) => id !== topic.id))}
                >
                  <XIcon aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        topics.data && <span className="entry-editor__note">{text("editorTopicsNone")}</span>
      )}
      <div className="topic-field__control">
        <Input
          id={inputId}
          role="combobox"
          aria-expanded={suggestions.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={suggestions.length > 0 ? optionId(activeIndex) : undefined}
          placeholder={text("editorTopicsAdd")}
          value={typed}
          maxLength={MaxLength.Line}
          lang={language}
          disabled={full}
          onChange={(event) => {
            setTyped(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        {suggestions.length > 0 && (
          <div ref={list} className="topic-field__list">
            <RowList id={listId} role="listbox" aria-label={text("editorTopics")}>
              {suggestions.map((suggestion, index) => {
                const current = index === activeIndex;
                const label =
                  suggestion.kind === "topic"
                    ? topicLabel(suggestion.topic, language).name
                    : text("editorTopicCreate", suggestion.name);
                return (
                  <Row
                    key={suggestion.kind === "topic" ? suggestion.topic.id : "create"}
                    id={optionId(index)}
                    role="option"
                    aria-selected={current}
                    data-active={current ? "" : undefined}
                    className="row--interactive"
                    // The field keeps the focus, so a click must not take it.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(suggestion)}
                    onMouseMove={() => setActive(index)}
                  >
                    <Row.Lead aria-hidden="true">
                      {suggestion.kind === "topic" ? <TagIcon /> : <PlusIcon />}
                    </Row.Lead>
                    <Row.Text title={label} />
                  </Row>
                );
              })}
            </RowList>
          </div>
        )}
      </div>
      {topics.isError && <ErrorNotice error={topics.error} />}
    </div>
  );
}
