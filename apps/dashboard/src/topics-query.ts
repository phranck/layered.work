import type { ContentLanguage, SaveTopicBody, TopicListItem } from "@layered/schemas";
import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDashboardApi } from "./dashboard-context.js";
import { refreshCounts } from "./dashboard-counts.js";
import { queryKeys } from "./query-keys.js";
import type { Reactions } from "./reactions.js";

/**
 * The topics as the dashboard holds them, in one cache entry the topics screen,
 * the editor's topic field and a navigation item share, and every change made
 * to them.
 *
 * A topic is shown on the entries that carry it, so renaming, merging or
 * deleting one fetches the entry lists and the opened entries again as well.
 */

/**
 * Fetches everything a change to a topic shows up in.
 *
 * @param client - The dashboard's query cache.
 */
function refreshAfterTopicChange(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: queryKeys.topics });
  void client.invalidateQueries({ queryKey: queryKeys.everyEntryList });
  void client.invalidateQueries({ queryKey: queryKeys.everyEntryDetail });
  void refreshCounts(client);
}

/**
 * Every topic with its names, addresses and how many entries carry it.
 *
 * @param enabled - Whether to ask at all, for a screen that needs the topics
 *   only once something is chosen.
 */
export function useTopics(enabled = true) {
  const api = useDashboardApi();
  return useQuery({ queryKey: queryKeys.topics, queryFn: api.fetchTopics, enabled });
}

/**
 * Stores a topic's names and addresses in both languages.
 *
 * @param topic - The topic being changed.
 * @param reactions - What the dialog does once it is stored or has failed.
 * @returns The mutation, which takes a body `topicBodyOf` has passed.
 */
export function useSaveTopic(topic: TopicListItem, reactions: Reactions<TopicListItem, SaveTopicBody>) {
  const api = useDashboardApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (value: SaveTopicBody) => api.saveTopic(topic.id, value),
    onError: (error) => reactions.onError?.(error),
    onSuccess: (saved, value) => {
      refreshAfterTopicChange(client);
      reactions.onSuccess?.(saved, value);
    },
  });
}

/**
 * Moves every entry of one topic to another and removes the first.
 *
 * @param topic - The topic that goes.
 * @param reactions - What the dialog does once it is merged or has failed.
 * @returns The mutation, which takes the id of the topic it is merged into.
 */
export function useMergeTopic(topic: TopicListItem, reactions: Reactions<TopicListItem, string>) {
  const api = useDashboardApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (into: string) => api.mergeTopic(topic.id, into),
    onError: (error) => reactions.onError?.(error),
    onSuccess: (merged, into) => {
      refreshAfterTopicChange(client);
      reactions.onSuccess?.(merged, into);
    },
  });
}

/**
 * Removes a topic from the site and from every entry.
 *
 * @param topic - The topic to delete.
 * @param reactions - What the dialog does once it is gone or has failed.
 */
export function useDeleteTopic(topic: TopicListItem, reactions: Reactions<void>) {
  const api = useDashboardApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.deleteTopic(topic.id),
    onError: (error) => reactions.onError?.(error),
    onSuccess: () => {
      refreshAfterTopicChange(client);
      reactions.onSuccess?.();
    },
  });
}

/**
 * Creates a topic from a name typed while writing, or answers with the one
 * that has that name, and adds it to the cached list at once, so the field can
 * show it as a chip before the list is fetched again.
 *
 * @param language - The entry's language, which the new topic is named in.
 * @param reactions - What the field does once the topic exists or has failed.
 * @returns The mutation, which takes the typed name.
 */
export function useCreateTopic(language: ContentLanguage, reactions: Reactions<TopicListItem, string>) {
  const api = useDashboardApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.createTopic({ language, name }),
    onError: (error) => reactions.onError?.(error),
    onSuccess: (topic, name) => {
      client.setQueryData<TopicListItem[]>(queryKeys.topics, (current) =>
        current?.some((item) => item.id === topic.id) ? current : [...(current ?? []), topic],
      );
      reactions.onSuccess?.(topic, name);
    },
  });
}
