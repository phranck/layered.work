import {
  CONTENT_LANGUAGES,
  type ContentLanguage,
  type SaveTopicBody,
  saveTopicBody,
  type TopicListItem,
} from "@layered/schemas";
import type { DashboardStringKey } from "./dashboard-i18n.js";

/**
 * The rules topics follow in the dashboard: what a topic is called in a
 * language, which topics a search leaves, which ones the editor's topic field
 * offers, and when typed names can be saved.
 */

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

/** The two fields of one language, as typed. */
export type NameDraft = { name: string; slug: string };

/**
 * A topic's names and addresses in both languages, as the edit dialog opens
 * them. A language the topic has no name in starts with both fields empty.
 *
 * @param topic - The topic as it is stored.
 */
export function nameDraftOf(topic: TopicListItem): Record<ContentLanguage, NameDraft> {
  return {
    en: { name: topic.en?.name ?? "", slug: topic.en?.slug ?? "" },
    de: { name: topic.de?.name ?? "", slug: topic.de?.slug ?? "" },
  };
}

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

/** How many suggestions the list under the topic field shows at once. */
const MAX_SUGGESTIONS = 8;

/** One line of the list under the topic field: an existing topic, or the new one the typed name makes. */
export type Suggestion = { kind: "topic"; topic: TopicListItem } | { kind: "create"; name: string };

/**
 * What the list under the topic field offers for a typed text.
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
