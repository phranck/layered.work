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
import { zoomOf } from "./interface-scale.js";

/**
 * The order of the sidebar's groups, which the reader sets by dragging a
 * group's title.
 *
 * The drag is pointer driven rather than HTML5 drag and drop, because the other
 * groups have to move out of the way of the one being dragged, and a drag image
 * cannot do that. Everything that can be measured is measured once, when the
 * drag starts; per pointer move the only work is writing a transform on each
 * group, which keeps the gesture on the compositor.
 *
 * The order is stored as the list of group ids rather than indices, so a group
 * that is renamed or added later degrades gracefully: an id stored but no longer
 * known is dropped, and a group known but not stored keeps its place at the end.
 */

/** Where the chosen order is kept between visits. */
export const SIDEBAR_ORDER_KEY = "layered:dashboard:sidebar-order";

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

/** The vertical extent of one group, as measured when the drag started. */
export interface GroupBox {
  top: number;
  height: number;
}

/**
 * Where the dragged group would land.
 *
 * The swap happens when the dragged group's middle passes the middle of the
 * group it is moving towards, so half of a neighbour has to be covered before
 * the order changes. The comparison is against the neighbour's middle, never
 * against the dragged group's own starting middle, which is already crossed at
 * the first pixel of travel.
 *
 * @param boxes - Every group's box, in their current order.
 * @param from - The index of the dragged group.
 * @param offset - How far the pointer has moved vertically since the drag began.
 */
export function dropIndex(boxes: readonly GroupBox[], from: number, offset: number): number {
  const origin = boxes[from];
  if (!origin) return from;
  const middle = origin.top + origin.height / 2 + offset;
  const middleOf = (index: number) => {
    const box = boxes[index] as GroupBox;
    return box.top + box.height / 2;
  };
  let index = from;
  while (index > 0 && middle < middleOf(index - 1)) index -= 1;
  while (index < boxes.length - 1 && middle > middleOf(index + 1)) index += 1;
  return index;
}

/**
 * What a drag knows from its first moment, so nothing is read back off the page while it runs.
 *
 * Every position is in the document's pixels, which are what a transform is
 * written in. The window's pixels, which the pointer and the boxes are measured
 * in, differ from them by the interface scale's zoom.
 */
interface Drag {
  pointerId: number;
  /** The zoom the window's pixels are divided by to give the document's. */
  zoom: number;
  from: number;
  to: number;
  originY: number;
  /** The sidebar's top, which the drop slot is positioned against. */
  containerTop: number;
  boxes: GroupBox[];
  /** The distance from each group's top to the next one's, gap included. */
  pitches: number[];
  elements: HTMLElement[];
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
  const drag = useRef<Drag | undefined>(undefined);
  /** Where each group stood before the last change of order, for the move into its new place. */
  const before = useRef<Map<string, number> | undefined>(undefined);

  const commit = useCallback((ids: string[]) => {
    before.current = new Map(
      [...elements.current].map(([id, element]) => [id, element.getBoundingClientRect().top]),
    );
    writeStored(SIDEBAR_ORDER_KEY, JSON.stringify(ids));
    setOrder(ids);
  }, []);

  // Each group starts where it stood and travels to where layout now puts it.
  // This runs once React has put the groups in their new DOM order and before
  // the browser paints. The drag's transforms are dropped here rather than
  // when the order is committed, and with the transition off, because dropping
  // them earlier would start a transition from the old DOM position and the
  // group would leap there first. The inverted offset is then written, the
  // layout is read once so the browser takes it as the starting point, and
  // clearing it lets the stylesheet's transition carry the group home.
  // biome-ignore lint/correctness/useExhaustiveDependencies: It has to run after each change of order, which is what the ref it reads describes.
  useLayoutEffect(() => {
    const previous = before.current;
    if (!previous) return;
    before.current = undefined;
    for (const [id, element] of elements.current) {
      element.style.transition = "none";
      element.style.transform = "";
      const top = previous.get(id);
      const delta = top === undefined ? 0 : (top - element.getBoundingClientRect().top) / zoomOf(element);
      if (Math.abs(delta) >= 0.5) element.style.transform = `translateY(${delta}px)`;
      element.getBoundingClientRect();
      element.style.transition = "";
      element.style.transform = "";
    }
  }, [order]);

  const ref = useCallback(
    (id: string) => (element: HTMLElement | null) => {
      if (element) elements.current.set(id, element);
      else elements.current.delete(id);
    },
    [],
  );

  /** Writes the shift every group takes for one target index, and moves the slot to the gap. */
  const place = (state: Drag, to: number) => {
    const { from, boxes, pitches, elements: groupElements } = state;
    const pitch = pitches[from] as number;
    for (const [index, element] of groupElements.entries()) {
      if (index === from) continue;
      let shift = 0;
      if (index > from && index <= to) shift = -pitch;
      if (index < from && index >= to) shift = pitch;
      element.style.transform = shift ? `translateY(${shift}px)` : "";
    }
    const target = boxes[to] as GroupBox;
    const gapTop = to > from ? target.top + (pitches[to] as number) - pitch : target.top;
    if (slot.current) slot.current.style.transform = `translateY(${gapTop - state.containerTop}px)`;
  };

  const finish = (event: PointerEvent<HTMLElement>) => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    drag.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    container.current?.removeAttribute("data-reordering");
    state.elements[state.from]?.removeAttribute("data-dragging");
    slot.current?.removeAttribute("data-visible");
    if (state.to === state.from) {
      for (const element of state.elements) element.style.transform = "";
      return;
    }
    commit(moveItem(order, state.from, state.to));
  };

  const handle = (id: string): GroupHandleProps => ({
    "data-section-handle": true,
    onPointerDown(event) {
      if (drag.current || event.button !== 0 || !container.current) return;
      const groupElements = order.map((groupId) => elements.current.get(groupId));
      if (groupElements.some((element) => !element)) return;
      const present = groupElements as HTMLElement[];
      const from = order.indexOf(id);
      if (from < 0) return;
      event.preventDefault();

      // One read of the layout, before anything moves. Reading a box again
      // during the drag would measure the transform just written.
      const zoom = zoomOf(container.current);
      const boxes = present.map((element) => {
        const box = element.getBoundingClientRect();
        return { top: box.top / zoom, height: box.height / zoom };
      });
      const pitches = boxes.map((box, index) => {
        const next = boxes[index + 1];
        return next ? next.top - box.top : box.height;
      });
      const state: Drag = {
        pointerId: event.pointerId,
        zoom,
        from,
        to: from,
        originY: event.clientY / zoom,
        containerTop: container.current.getBoundingClientRect().top / zoom,
        boxes,
        pitches,
        elements: present,
      };
      drag.current = state;
      event.currentTarget.setPointerCapture(event.pointerId);
      container.current.setAttribute("data-reordering", "");
      present[from]?.setAttribute("data-dragging", "");
      if (slot.current) {
        slot.current.style.height = `${boxes[from]?.height ?? 0}px`;
        slot.current.setAttribute("data-visible", "");
      }
      place(state, from);
    },
    onPointerMove(event) {
      const state = drag.current;
      if (!state || state.pointerId !== event.pointerId) return;
      const offset = event.clientY / state.zoom - state.originY;
      const dragged = state.elements[state.from];
      if (dragged) dragged.style.transform = `translateY(${offset}px)`;
      const to = dropIndex(state.boxes, state.from, offset);
      if (to !== state.to) {
        state.to = to;
        place(state, to);
      }
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
