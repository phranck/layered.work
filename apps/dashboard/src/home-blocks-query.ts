import {
  HOME_BLOCKS,
  type HomeBlockSettings,
  type HomeBlockType,
  homeBlockSettingsSchema,
  homeBlockTypes,
  type StoredHomeBlock,
} from "@layered/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDashboardApi } from "./dashboard-context.js";
import { refreshCounts } from "./dashboard-counts.js";
import type { Position } from "./list-order.js";
import { queryKeys } from "./query-keys.js";
import type { Reactions } from "./reactions.js";

/**
 * The home page's blocks as the dashboard holds them, every change made to
 * one, and the rules the arrangement follows: a locked block opens the page,
 * exists once, and nothing moves above it.
 */

/** The types a block can be added as. A locked block exists once and is already there. */
export const ADDABLE_BLOCKS = homeBlockTypes.filter((type) => !HOME_BLOCKS[type].locked);

/**
 * Where a block dragged to `to` may actually go: never above a locked block,
 * which opens the page.
 *
 * @param blocks - The list in its current order.
 * @param to - Where the block was dropped.
 */
export function allowedTarget(blocks: readonly StoredHomeBlock[], to: number): number {
  const firstMovable = blocks.findIndex((block) => !HOME_BLOCKS[block.type].locked);
  return Math.max(to, firstMovable === -1 ? 0 : firstMovable);
}

/**
 * A block's settings as the body a save sends, or the key of the first setting
 * the block's declaration refuses.
 *
 * @param type - The block's type, whose declaration checks the settings.
 * @param draft - The settings as the panel holds them.
 */
export function checkedBlockSettings(
  type: HomeBlockType,
  draft: HomeBlockSettings,
): { value: HomeBlockSettings } | { invalidKey: string } {
  const parsed = homeBlockSettingsSchema(type).safeParse(draft);
  if (parsed.success) return { value: parsed.data };
  return { invalidKey: String(parsed.error.issues[0]?.path[0] ?? "") };
}

/** Every block, in the order of the page. */
export function useHomeBlocks() {
  const api = useDashboardApi();
  return useQuery({ queryKey: queryKeys.homeBlocks, queryFn: api.fetchHomeBlocks });
}

/** Fetches the blocks and the sidebar's count again after one was added, switched or removed. */
function useRefreshBlocks() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: queryKeys.homeBlocks });
    void refreshCounts(client);
  };
}

/**
 * Puts a block on the page or takes it off, keeping its settings.
 *
 * @param reactions - What the screen does once it is stored or has failed.
 * @returns The mutation, which takes the block as it is stored.
 */
export function useToggleHomeBlock(reactions: Reactions<StoredHomeBlock, StoredHomeBlock>) {
  const api = useDashboardApi();
  const refresh = useRefreshBlocks();
  return useMutation({
    mutationFn: (block: StoredHomeBlock) =>
      api.saveHomeBlock(block.id, { enabled: !block.enabled, settings: block.settings }),
    onError: (error) => reactions.onError?.(error),
    onSuccess: (saved, block) => {
      refresh();
      reactions.onSuccess?.(saved, block);
    },
  });
}

/**
 * Stores the order of the blocks and keeps the answer, which holds every
 * block, as the cached list.
 *
 * @param reactions - What the screen does once it is stored or has failed.
 * @returns The mutation, which takes every block's new place.
 */
export function useReorderHomeBlocks(reactions: Reactions<StoredHomeBlock[], Position[]>) {
  const api = useDashboardApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.reorderHomeBlocks,
    onError: (error) => reactions.onError?.(error),
    onSuccess: (ordered, positions) => {
      client.setQueryData(queryKeys.homeBlocks, ordered);
      reactions.onSuccess?.(ordered, positions);
    },
  });
}

/**
 * Adds a block of one type at the end of the page, on its defaults.
 *
 * @param reactions - What the screen does once it exists or has failed.
 * @returns The mutation, which takes the type.
 */
export function useAddHomeBlock(reactions: Reactions<StoredHomeBlock, HomeBlockType>) {
  const api = useDashboardApi();
  const refresh = useRefreshBlocks();
  return useMutation({
    mutationFn: (type: HomeBlockType) => api.addHomeBlock({ type }),
    onError: (error) => reactions.onError?.(error),
    onSuccess: (added, type) => {
      refresh();
      reactions.onSuccess?.(added, type);
    },
  });
}

/**
 * Stores a block's settings and writes the answer into the cached list, so
 * the table's summary of the block follows at once.
 *
 * @param block - The block whose settings are stored.
 * @param reactions - What the panel does once they are stored or have failed.
 * @returns The mutation, which takes settings `checkedBlockSettings` has passed.
 */
export function useSaveHomeBlock(
  block: StoredHomeBlock,
  reactions: Reactions<StoredHomeBlock, HomeBlockSettings>,
) {
  const api = useDashboardApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (settings: HomeBlockSettings) =>
      api.saveHomeBlock(block.id, { enabled: block.enabled, settings }),
    onError: (error) => reactions.onError?.(error),
    onSuccess: (saved, settings) => {
      client.setQueryData<StoredHomeBlock[]>(queryKeys.homeBlocks, (current) =>
        current?.map((item) => (item.id === saved.id ? saved : item)),
      );
      reactions.onSuccess?.(saved, settings);
    },
  });
}

/**
 * Takes a block off the page for good, with its settings.
 *
 * @param block - The block to delete.
 * @param reactions - What the dialog does once it is gone or has failed.
 */
export function useDeleteHomeBlock(block: StoredHomeBlock, reactions: Reactions<void>) {
  const api = useDashboardApi();
  const refresh = useRefreshBlocks();
  return useMutation({
    mutationFn: () => api.deleteHomeBlock(block.id),
    onError: (error) => reactions.onError?.(error),
    onSuccess: () => {
      refresh();
      reactions.onSuccess?.();
    },
  });
}
