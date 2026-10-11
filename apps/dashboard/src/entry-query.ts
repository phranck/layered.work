import type { EmptiedTrash, EntryDetail, EntryKind, EntryPreview, SaveEntryBody } from "@layered/schemas";
import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDashboardApi } from "./dashboard-context.js";
import { refreshCounts } from "./dashboard-counts.js";
import { queryKeys } from "./query-keys.js";
import type { Reactions } from "./reactions.js";

/**
 * The entries as the dashboard holds them, and every change made to one.
 *
 * Creating, saving, trashing, restoring and translating each change what more
 * than one screen shows: the list of the entry's kind, the opened translation,
 * the topics screen's counts and the sidebar's figures. Each change says here
 * which of those it refreshes, so a screen only draws and says what happened.
 */

/**
 * Fetches every list and every opened translation again, and the sidebar's
 * counts, after a change that reaches across them.
 *
 * @param client - The dashboard's query cache.
 */
export function refreshEntries(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: queryKeys.everyEntryList });
  void client.invalidateQueries({ queryKey: queryKeys.everyEntryDetail });
  void refreshCounts(client);
}

/**
 * Every translation of one kind, as its list shows them.
 *
 * @param kind - Which entries.
 */
export function useEntryList(kind: EntryKind) {
  const api = useDashboardApi();
  return useQuery({ queryKey: queryKeys.entryList(kind), queryFn: () => api.fetchEntries(kind) });
}

/**
 * One translation, as the editor opens it.
 *
 * @param id - The translation's id.
 */
export function useEntry(id: string) {
  const api = useDashboardApi();
  return useQuery({ queryKey: queryKeys.entryDetail(id), queryFn: () => api.fetchEntry(id) });
}

/**
 * What moving one translation to the trash affects, asked when the question
 * opens, so the figures describe the entry as it is stored at that moment.
 *
 * @param id - The translation's id.
 */
export function useTrashImpact(id: string) {
  const api = useDashboardApi();
  return useQuery({ queryKey: queryKeys.trashImpact(id), queryFn: () => api.fetchTrashImpact(id) });
}

/**
 * Creates a draft of one kind, and keeps it as the opened translation, so the
 * editor opens it without asking again.
 *
 * @param kind - Which kind of entry.
 * @param reactions - What the screen does once it exists or has failed.
 * @returns The mutation, which takes the draft's title.
 */
export function useCreateEntry(kind: EntryKind, reactions: Reactions<EntryDetail, string>) {
  const api = useDashboardApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (title: string) => api.createEntry({ kind, title }),
    onError: (error) => reactions.onError?.(error),
    onSuccess: (created, title) => {
      client.setQueryData(queryKeys.entryDetail(created.id), created);
      refreshEntries(client);
      reactions.onSuccess?.(created, title);
    },
  });
}

/**
 * Takes a translation out of the trash, from its list or from its editor.
 *
 * @param reactions - What the screen does once it is back or has failed.
 * @returns The mutation, which takes the translation's id.
 */
export function useRestoreEntry(reactions: Reactions<EntryDetail, string>) {
  const api = useDashboardApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.setTrashed(id, false),
    onError: (error) => reactions.onError?.(error),
    onSuccess: (stored, id) => {
      client.setQueryData(queryKeys.entryDetail(stored.id), stored);
      refreshEntries(client);
      reactions.onSuccess?.(stored, id);
    },
  });
}

/**
 * Moves a translation to the trash.
 *
 * @param id - The translation's id.
 * @param reactions - What the screen does once it is in the trash or has failed.
 */
export function useTrashEntry(id: string, reactions: Reactions<EntryDetail>) {
  const api = useDashboardApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.setTrashed(id, true),
    onError: (error) => reactions.onError?.(error),
    onSuccess: (stored) => {
      refreshEntries(client);
      reactions.onSuccess?.(stored);
    },
  });
}

/**
 * Deletes every translation of one kind in the trash, for good.
 *
 * @param kind - Which kind of entry.
 * @param reactions - What the screen does once the trash is empty or has failed.
 */
export function useEmptyTrash(kind: EntryKind, reactions: Reactions<EmptiedTrash>) {
  const api = useDashboardApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.emptyTrash(kind),
    onError: (error) => reactions.onError?.(error),
    onSuccess: (emptied) => {
      refreshEntries(client);
      reactions.onSuccess?.(emptied);
    },
  });
}

/** What one save is given: the draft to store, and whether the editor started it by itself. */
export interface EntrySave {
  value: SaveEntryBody;
  automatic: boolean;
}

/**
 * Stores what the editor holds for one translation, and keeps the answer as the
 * opened translation. The list of its kind and the topics screen, which counts
 * the entries of each topic, are fetched again.
 *
 * @param entry - The translation being edited.
 * @param reactions - What the editor does once it is stored or has failed.
 */
export function useSaveEntry(entry: EntryDetail, reactions: Reactions<EntryDetail, EntrySave>) {
  const api = useDashboardApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ value }: EntrySave) => api.saveEntry(entry.id, value),
    onError: (error) => reactions.onError?.(error),
    onSuccess: (stored, save) => {
      client.setQueryData(queryKeys.entryDetail(entry.id), stored);
      void client.invalidateQueries({ queryKey: queryKeys.entryList(entry.kind) });
      void client.invalidateQueries({ queryKey: queryKeys.topics });
      reactions.onSuccess?.(stored, save);
    },
  });
}

/**
 * Creates the other language of a translation's entry as a draft, or returns
 * it where it exists, and keeps it as an opened translation.
 *
 * @param entry - The translation the other language is made from.
 * @param reactions - What the editor does once it exists or has failed.
 */
export function useCreateTranslation(entry: EntryDetail, reactions: Reactions<EntryDetail>) {
  const api = useDashboardApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.createTranslation(entry.id),
    onError: (error) => reactions.onError?.(error),
    onSuccess: (created) => {
      client.setQueryData(queryKeys.entryDetail(created.id), created);
      void client.invalidateQueries({ queryKey: queryKeys.entryDetail(entry.id) });
      void client.invalidateQueries({ queryKey: queryKeys.entryList(entry.kind) });
      reactions.onSuccess?.(created);
    },
  });
}

/** What one preview is given: the draft to show, and the window opened for it. */
export interface EntryPreviewRequest {
  value: SaveEntryBody;
  target: Window | null;
}

/**
 * Shows what the editor holds, saved or not, in a window of its own.
 *
 * The window is opened on the click itself, because Safari blocks one opened
 * after a request returns, and is sent to the preview's address once the API
 * has made it. It is cut loose from the dashboard, so the preview cannot reach
 * back into it. A failure closes the window again.
 *
 * @param entry - The translation being previewed.
 * @param reactions - What the editor does when the preview could not be made.
 */
export function useEntryPreview(entry: EntryDetail, reactions: Reactions<EntryPreview, EntryPreviewRequest>) {
  const api = useDashboardApi();
  return useMutation({
    mutationFn: ({ value }: EntryPreviewRequest) =>
      api.createPreview(entry.id, {
        title: value.title,
        summary: value.summary,
        body: value.body,
        readingWidth: value.readingWidth,
      }),
    onSuccess: (preview, request) => {
      if (request.target) {
        request.target.opener = null;
        request.target.location.href = preview.url;
      } else {
        window.open(preview.url, "_blank", "noopener");
      }
      reactions.onSuccess?.(preview, request);
    },
    onError: (error, request) => {
      request.target?.close();
      reactions.onError?.(error);
    },
  });
}
