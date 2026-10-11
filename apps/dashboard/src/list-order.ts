/**
 * How a list the reader arranges is reordered, and the positions the API
 * stores for it.
 *
 * The sidebar, the specification pairs, the navigation, the social accounts
 * and the home page's blocks all move one item at a time and store the whole
 * order afterwards, so they share these rules.
 */

/**
 * A list with one item moved.
 *
 * @param items - The list as it is.
 * @param from - Where the item stands.
 * @param to - Where it ends up, counted in the list after the move.
 */
export function moveItem<Item>(items: readonly Item[], from: number, to: number): Item[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved !== undefined) next.splice(to, 0, moved);
  return next;
}

/** One stored item's place in its list, as a reorder request names it. */
export interface Position {
  id: string;
  sortOrder: number;
}

/**
 * Every item's place once one has moved, numbered from zero in the new order,
 * which is what a reorder request sends.
 *
 * @param items - The list as it is stored.
 * @param from - Where the moved item stands.
 * @param to - Where it ends up.
 */
export function reorderedPositions(items: readonly { id: string }[], from: number, to: number): Position[] {
  return moveItem(items, from, to).map((item, sortOrder) => ({ id: item.id, sortOrder }));
}

/**
 * The place a new item takes: after every item there is, or the first place in
 * an empty list.
 *
 * @param items - The list as it is stored.
 */
export function nextSortOrder(items: readonly { sortOrder: number }[]): number {
  return Math.max(-1, ...items.map((item) => item.sortOrder)) + 1;
}
