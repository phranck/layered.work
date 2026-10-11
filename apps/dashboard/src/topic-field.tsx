import { type ContentLanguage, MAX_TOPICS_PER_ENTRY, MaxLength } from "@layered/schemas";
import { FieldHint, Input, Row, RowList } from "@layered/ui";
import { PlusIcon, TagIcon, XIcon } from "@layered/ui/icons";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { LANGUAGE_TEXT, otherLanguage } from "./entry-model.js";
import { ErrorNotice } from "./error-notice.js";
import { useDashboardLanguage } from "./language-context.js";
import { useListbox } from "./listbox.js";
import { useNotify } from "./notifications.js";
import { type Suggestion, topicLabel, topicSuggestions } from "./topics-model.js";
import { useCreateTopic, useTopics } from "./topics-query.js";

/**
 * An entry's topics in the editor panel: a chip per topic with a button that
 * removes it, and a field that completes topics as they are typed.
 *
 * The field offers the topics whose name in either language contains what was
 * typed, and a line that creates a new one under that name where no topic has
 * it yet, so a topic is made without leaving the text. The change belongs to
 * the draft and is saved with the entry.
 *
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
  const { text } = useDashboardLanguage();
  const { notifyError } = useNotify();
  const listId = useId();
  const topics = useTopics();
  const [typed, setTyped] = useState("");

  const all = topics.data ?? [];
  const chosen = value
    .map((id) => all.find((topic) => topic.id === id))
    .filter((topic) => topic !== undefined);
  const suggestions = topicSuggestions(all, value, typed, language);
  const full = value.length >= MAX_TOPICS_PER_ENTRY;

  const add = (id: string) => {
    if (!value.includes(id)) onChange([...value, id]);
    setTyped("");
    listbox.reset();
  };
  const create = useCreateTopic(language, { onError: notifyError, onSuccess: (topic) => add(topic.id) });
  const choose = (suggestion: Suggestion) => {
    if (suggestion.kind === "topic") add(suggestion.topic.id);
    else create.mutate(suggestion.name);
  };

  const listbox = useListbox(suggestions, (suggestion) => {
    if (!create.isPending) choose(suggestion);
  });

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (listbox.onKeyDown(event)) return;
    if (event.key === "Enter") {
      // Enter in this field never submits anything around it.
      event.preventDefault();
    } else if (event.key === "Escape" && typed) {
      event.preventDefault();
      setTyped("");
    } else if (event.key === "Backspace" && !typed && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  // The list opens and closes by its height. While it closes it goes on showing
  // what it held, so the closing is seen rather than the lines vanishing first.
  const [kept, setKept] = useState<Suggestion[]>([]);
  useEffect(() => {
    const next = topicSuggestions(topics.data ?? [], value, typed, language);
    if (next.length > 0) setKept(next);
  }, [topics.data, value, typed, language]);
  const open = suggestions.length > 0;
  const listed = open ? suggestions : kept;

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
        topics.data && <FieldHint>{text("editorTopicsNone")}</FieldHint>
      )}
      <div className="topic-field__control">
        <Input
          id={inputId}
          role="combobox"
          aria-expanded={suggestions.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={suggestions.length > 0 ? optionId(listbox.activeIndex) : undefined}
          placeholder={text("editorTopicsAdd")}
          value={typed}
          maxLength={MaxLength.Line}
          lang={language}
          disabled={full}
          onChange={(event) => {
            setTyped(event.target.value);
            listbox.reset();
          }}
          onKeyDown={onKeyDown}
        />
        <div ref={list} className="topic-field__reveal" data-open={open || undefined} inert={!open}>
          <div className="topic-field__clip">
            <RowList
              id={listId}
              role="listbox"
              aria-label={text("editorTopics")}
              className="topic-field__list"
            >
              {listed.map((suggestion, index) => {
                const label =
                  suggestion.kind === "topic"
                    ? topicLabel(suggestion.topic, language).name
                    : text("editorTopicCreate", suggestion.name);
                return (
                  <Row
                    key={suggestion.kind === "topic" ? suggestion.topic.id : "create"}
                    id={optionId(index)}
                    className="row--interactive"
                    // The field keeps the focus, so a click must not take it.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(suggestion)}
                    {...listbox.optionProps(index)}
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
        </div>
      </div>
      {topics.isError && <ErrorNotice error={topics.error} />}
    </div>
  );
}
