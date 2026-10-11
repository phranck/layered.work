import {
  type ContentLanguage,
  type EntryList,
  type FooterNavigation,
  type NavigationPlacement,
  type SaveFooterNavigationBody,
  saveFooterNavigationBody,
  type TopicList,
} from "@layered/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDashboardApi } from "./dashboard-context.js";
import { refreshCounts } from "./dashboard-counts.js";
import { inPositions, type Position } from "./list-order.js";
import { queryKeys } from "./query-keys.js";
import type { Reactions } from "./reactions.js";
import type { DashboardArea } from "./routes.js";

/**
 * The site's two navigations as the dashboard holds them, every change made to
 * a group of links, and the rules a group's draft follows.
 *
 * The main and the footer navigation are the same screen with another
 * placement, so every query and change here takes the placement it is about.
 */

/**
 * Which navigation a sidebar area edits.
 *
 * @param area - The area.
 */
export function placementOf(area: DashboardArea): NavigationPlacement {
  return area.id === "main-nav" ? "main" : "footer";
}

/** One link of a group as the editor holds it, with a key that stays while its fields change. */
export type DraftItem = SaveFooterNavigationBody["items"][number] & { key: string };

/** What a link of a navigation points at. */
export type TargetKind = "external" | "entry" | "topic";

/**
 * Whether a group holds a link that points nowhere, such as one whose entry or
 * topic was deleted.
 *
 * @param group - The group as it is stored.
 */
export function hasBrokenLink(group: FooterNavigation): boolean {
  return group.items.some((item) => !item.entryId && !item.topicId && !item.href);
}

/**
 * The links of a group as the editor opens them, each keyed by its id.
 *
 * @param group - The group as it is stored, or null for a new one.
 */
export function draftItemsOf(group: FooterNavigation | null): DraftItem[] {
  return group?.items.map((item) => ({ ...item, key: item.id })) ?? [];
}

/** A new link at the end of a group: shown in both languages, named in neither, pointing nowhere yet. */
export function newNavigationItem(): DraftItem {
  return {
    key: crypto.randomUUID(),
    id: crypto.randomUUID(),
    label: { en: "", de: "" },
    visible: { en: true, de: true },
    href: null,
    entryId: null,
    topicId: null,
    parentId: null,
  };
}

/**
 * The links without one of them. A link that stood under the removed one moves
 * up to the top level, because a link cannot stand under one that is gone.
 *
 * @param items - The links as the editor holds them.
 * @param removed - The link to remove.
 */
export function withoutItem(items: readonly DraftItem[], removed: DraftItem): DraftItem[] {
  return items
    .filter((candidate) => candidate.key !== removed.key)
    .map((candidate) => (candidate.parentId === removed.id ? { ...candidate, parentId: null } : candidate));
}

/**
 * A group's draft as the body a save sends, or null where the schema the API
 * validates with refuses it.
 *
 * @param title - The group's title in both languages.
 * @param sortOrder - The group's place among the groups.
 * @param items - The links as the editor holds them.
 */
export function navigationBodyOf(
  title: SaveFooterNavigationBody["title"],
  sortOrder: number,
  items: readonly DraftItem[],
): SaveFooterNavigationBody | null {
  const parsed = saveFooterNavigationBody.safeParse({
    title,
    sortOrder,
    items: items.map(({ key: _key, ...item }) => item),
  });
  return parsed.success ? parsed.data : null;
}

/**
 * What a link points at, as the editor's first select shows it.
 *
 * @param item - The link.
 */
export function targetKindOf(item: Pick<DraftItem, "entryId" | "topicId">): TargetKind {
  return item.entryId ? "entry" : item.topicId ? "topic" : "external";
}

/** One choice of the select that names a link's target. */
export interface TargetOption {
  value: string;
  label: string;
}

/**
 * What a link may point at, of one kind: every entry once, by its title, or
 * every topic by its name in the interface language. A target the link holds
 * that is no longer among them is offered as broken, so the select can show
 * what the link points at.
 *
 * @param kind - Whether entries or topics are offered.
 * @param entries - Every entry that is not in the trash.
 * @param topics - Every topic.
 * @param language - The interface language, which a topic is named in where it can be.
 * @param selected - The id the link points at, or empty.
 * @param brokenLabel - What a target that is gone is called.
 */
export function targetOptions(
  kind: Exclude<TargetKind, "external">,
  entries: EntryList | undefined,
  topics: TopicList | undefined,
  language: ContentLanguage,
  selected: string,
  brokenLabel: string,
): TargetOption[] {
  const options =
    kind === "entry"
      ? [...new Map(entries?.map((row) => [row.entryId, { value: row.entryId, label: row.title }])).values()]
      : (topics?.map((row) => ({
          value: row.id,
          label: row[language]?.name ?? row.en?.name ?? row.de?.name ?? row.id,
        })) ?? []);
  if (selected && !options.some((option) => option.value === selected))
    options.push({ value: selected, label: brokenLabel });
  return options;
}

/**
 * Every entry of every kind that is not in the trash, as a link offers them as
 * targets.
 *
 * @param enabled - Whether to ask, which a link does only once it points at an entry.
 */
export function useNavigationTargetEntries(enabled: boolean) {
  const api = useDashboardApi();
  return useQuery({
    queryKey: queryKeys.navigationTargetEntries,
    enabled,
    queryFn: async () =>
      (await Promise.all([api.fetchEntries("post"), api.fetchEntries("page"), api.fetchEntries("project")]))
        .flat()
        .filter((row) => !row.trashed),
  });
}

/**
 * The groups of one navigation, in the order the site shows them.
 *
 * @param placement - Which navigation.
 */
export function useNavigation(placement: NavigationPlacement) {
  const api = useDashboardApi();
  return useQuery({
    queryKey: queryKeys.navigation(placement),
    queryFn: () => api.fetchFooterNavigations(placement),
  });
}

/** Fetches a navigation's groups and the sidebar's counts again after a change to one. */
function useRefreshNavigation(placement: NavigationPlacement) {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: queryKeys.navigation(placement) });
    void refreshCounts(client);
  };
}

/**
 * Stores the order of a navigation's groups.
 *
 * @param placement - Which navigation.
 * @param reactions - What the screen does once it is stored or has failed.
 * @returns The mutation, which takes every group's new place.
 */
export function useReorderNavigation(
  placement: NavigationPlacement,
  reactions: Reactions<FooterNavigation[], Position[]>,
) {
  const api = useDashboardApi();
  const client = useQueryClient();
  const refresh = useRefreshNavigation(placement);
  return useMutation({
    mutationFn: (positions: Position[]) => api.reorderFooterNavigations(positions, placement),
    onMutate: (positions) => {
      client.setQueryData<FooterNavigation[]>(
        queryKeys.navigation(placement),
        (current) => current && inPositions(current, positions),
      );
    },
    onError: (error) => {
      refresh();
      reactions.onError?.(error);
    },
    onSuccess: (groups, positions) => {
      refresh();
      reactions.onSuccess?.(groups, positions);
    },
  });
}

/**
 * Creates a group of links or stores an existing one.
 *
 * @param placement - Which navigation.
 * @param group - The group being changed, or null for a new one.
 * @param reactions - What the dialog does once it is stored or has failed.
 * @returns The mutation, which takes a body `navigationBodyOf` has made.
 */
export function useSaveNavigation(
  placement: NavigationPlacement,
  group: FooterNavigation | null,
  reactions: Reactions<FooterNavigation, SaveFooterNavigationBody>,
) {
  const api = useDashboardApi();
  const refresh = useRefreshNavigation(placement);
  return useMutation({
    mutationFn: (value: SaveFooterNavigationBody) =>
      group
        ? api.saveFooterNavigation(group.id, value, placement)
        : api.createFooterNavigation(value, placement),
    onError: (error) => reactions.onError?.(error),
    onSuccess: (saved, value) => {
      refresh();
      reactions.onSuccess?.(saved, value);
    },
  });
}

/**
 * Deletes a group and its links.
 *
 * @param placement - Which navigation.
 * @param group - The group to delete.
 * @param reactions - What the dialog does once it is gone or has failed.
 */
export function useDeleteNavigation(
  placement: NavigationPlacement,
  group: FooterNavigation,
  reactions: Reactions<void>,
) {
  const api = useDashboardApi();
  const refresh = useRefreshNavigation(placement);
  return useMutation({
    mutationFn: () => api.deleteFooterNavigation(group.id, placement),
    onError: (error) => reactions.onError?.(error),
    onSuccess: () => {
      refresh();
      reactions.onSuccess?.();
    },
  });
}
