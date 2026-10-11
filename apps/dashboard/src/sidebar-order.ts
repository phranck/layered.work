import { readStored, writeStored } from "@layered/ui/stored";
import {
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  beginDrag,
  type DragState,
  endDrag,
  followPointer,
  gapTop,
  positionsOf,
  travelHome,
} from "./drag-order.js";
import { moveItem } from "./list-order.js";
import { storedChoiceKey } from "./stored-choice.js";

/**
 * The order of the sidebar's groups, which the reader sets by dragging a
 * group's title.
 *
 * The drag is pointer driven rather than HTML5 drag and drop, because the other
 * groups have to move out of the way of the one being dragged, and a drag image
 * cannot do that. The movement itself is `drag-order.ts`, which every list the
 * reader orders by hand shares; the sidebar adds the outline that shows where
 * a group will land.
 *
 * The order is stored as the list of group ids rather than indices, so a group
 * that is renamed or added later degrades gracefully: an id stored but no longer
 * known is dropped, and a group known but not stored keeps its place at the end.
 */

/** Where the chosen order is kept between visits. */
export const SIDEBAR_ORDER_KEY = storedChoiceKey("sidebar-order");

/**
 * The group ids a stored value holds, or none where it holds anything else.
 *
 * @param stored - What storage holds, if anything.
 */
export function readOrder(stored: string | null): string[] {
  try {
    const ids: unknown = JSON.parse(stored ?? "[]");
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/**
 * The groups in the order the reader left them.
 *
 * @param groups - Every group, in the order the code declares them.
 * @param ids - The order the reader chose, as group ids.
 * @returns The same groups, reordered by the ids that are known, with the rest
 *   after them in their declared order.
 */
export function orderGroups<Group extends { id: string }>(
  groups: readonly Group[],
  ids: readonly string[],
): Group[] {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const ordered = ids.flatMap((id) => {
    const group = byId.get(id);
    if (!group) return [];
    byId.delete(id);
    return [group];
  });
  return [...ordered, ...byId.values()];
}

/** What a group's title needs to be the handle that drags it. */
export interface GroupHandleProps {
  "data-section-handle": true;
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
}

/** What the grip inside a title needs to move its group from the keyboard. */
export interface GroupGripProps {
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

/**
 * Lets the reader reorder the sidebar's groups and remembers the order.
 *
 * Moving a group by keyboard or by drag both end in the same place: the new
 * order is stored, React renders the groups in it, and each group that changed
 * position travels there from where it was, rather than jumping.
 *
 * @param groups - Every group, in the order the code declares them.
 * @param container - The sidebar, which the drop slot is positioned in.
 * @param slot - The outline that shows where a dragged group will land.
 * @returns The groups in order, a ref setter per group, and handle props per group.
 */
export function useSidebarOrder<Group extends { id: string }>(
  groups: readonly Group[],
  container: RefObject<HTMLElement | null>,
  slot: RefObject<HTMLElement | null>,
) {
  const [order, setOrder] = useState<string[]>(() =>
    orderGroups(groups, readOrder(readStored(SIDEBAR_ORDER_KEY))).map((group) => group.id),
  );
  const ordered = useMemo(() => orderGroups(groups, order), [groups, order]);

  const elements = useRef(new Map<string, HTMLElement>());
  const drag = useRef<(DragState & { containerTop: number }) | undefined>(undefined);
  /** Where each group stood before the last change of order, for the move into its new place. */
  const before = useRef<Map<HTMLElement, number> | undefined>(undefined);

  const commit = useCallback((ids: string[]) => {
    before.current = positionsOf(elements.current.values());
    writeStored(SIDEBAR_ORDER_KEY, JSON.stringify(ids));
    setOrder(ids);
  }, []);

  // Each group travels from where it stood to where layout now puts it, once
  // React has put the groups in their new order and before the browser paints.
  // biome-ignore lint/correctness/useExhaustiveDependencies: It has to run after each change of order, which is what the ref it reads describes.
  useLayoutEffect(() => {
    const previous = before.current;
    if (!previous) return;
    before.current = undefined;
    travelHome(previous);
  }, [order]);

  const ref = useCallback(
    (id: string) => (element: HTMLElement | null) => {
      if (element) elements.current.set(id, element);
      else elements.current.delete(id);
    },
    [],
  );

  /** Moves the outline to the gap the other groups open. */
  const showSlot = (state: DragState & { containerTop: number }) => {
    if (slot.current) slot.current.style.transform = `translateY(${gapTop(state) - state.containerTop}px)`;
  };

  const finish = (event: PointerEvent<HTMLElement>) => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    drag.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    container.current?.removeAttribute("data-reordering");
    slot.current?.removeAttribute("data-visible");
    const to = endDrag(state);
    if (to !== state.from) commit(moveItem(order, state.from, to));
  };

  const handle = (id: string): GroupHandleProps => ({
    "data-section-handle": true,
    onPointerDown(event) {
      if (drag.current || event.button !== 0 || !container.current) return;
      const groupElements = order.map((groupId) => elements.current.get(groupId));
      if (groupElements.some((element) => !element)) return;
      const from = order.indexOf(id);
      if (from < 0) return;
      event.preventDefault();
      const started = beginDrag(groupElements as HTMLElement[], from, event.pointerId, event.clientY);
      const state = {
        ...started,
        containerTop: container.current.getBoundingClientRect().top / started.zoom,
      };
      drag.current = state;
      event.currentTarget.setPointerCapture(event.pointerId);
      container.current.setAttribute("data-reordering", "");
      if (slot.current) {
        slot.current.style.height = `${state.boxes[from]?.height ?? 0}px`;
        slot.current.setAttribute("data-visible", "");
      }
      showSlot(state);
    },
    onPointerMove(event) {
      const state = drag.current;
      if (!state || state.pointerId !== event.pointerId) return;
      if (followPointer(state, event.clientY)) showSlot(state);
    },
    onPointerUp: finish,
    onPointerCancel: finish,
  });

  const grip = (id: string): GroupGripProps => ({
    onKeyDown(event) {
      const from = order.indexOf(id);
      const to = event.key === "ArrowUp" ? from - 1 : event.key === "ArrowDown" ? from + 1 : undefined;
      if (to === undefined || from < 0) return;
      event.preventDefault();
      if (to < 0 || to >= order.length) return;
      commit(moveItem(order, from, to));
    },
  });

  return { ordered, ref, handle, grip };
}
