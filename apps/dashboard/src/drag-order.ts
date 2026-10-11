import { zoomOf } from "./interface-scale.js";

/**
 * Dragging one item of a list into another place, and the move of every item
 * into its new place afterwards, for every list in the dashboard the reader
 * orders by hand: the sidebar's groups, a table's rows and a dialog's blocks.
 *
 * Everything that can be measured is measured once, when the drag starts. Per
 * pointer move the only work is writing a transform on the dragged item and on
 * the items that make room for it, which keeps the gesture on the compositor.
 * When the order has changed, each item travels from where it was last seen to
 * where layout now puts it, through the transition its stylesheet gives it,
 * so a change of order is seen as movement rather than as a redraw.
 */

/** The vertical extent of one item, as measured when the drag started. */
export interface GroupBox {
  top: number;
  height: number;
}

/**
 * Where the dragged item would land.
 *
 * The swap happens when the dragged item's middle passes the middle of the item
 * it is moving towards, so half of a neighbour has to be covered before the
 * order changes. The comparison is against the neighbour's middle, never
 * against the dragged item's own starting middle, which is already crossed at
 * the first pixel of travel.
 *
 * @param boxes - Every item's box, in their current order.
 * @param from - The index of the dragged item.
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
 * What a drag knows from its first moment, so nothing is read back off the
 * page while it runs.
 *
 * Every position is in the document's pixels, which are what a transform is
 * written in. The window's pixels, which the pointer and the boxes are measured
 * in, differ from them by the interface scale's zoom.
 *
 * @property zoom - The zoom the window's pixels are divided by to give the document's.
 * @property pitches - The distance from each item's top to the next one's, gap included.
 */
export interface DragState {
  pointerId: number;
  zoom: number;
  from: number;
  to: number;
  originY: number;
  boxes: GroupBox[];
  pitches: number[];
  elements: HTMLElement[];
}

/**
 * Starts a drag: measures every item once and marks the dragged one, which its
 * stylesheet lifts and takes out of the transition.
 *
 * @param elements - Every item, in the list's order.
 * @param from - The dragged item's position.
 * @param pointerId - The pointer that drags it.
 * @param clientY - Where the pointer stands, in the window's pixels.
 */
export function beginDrag(
  elements: HTMLElement[],
  from: number,
  pointerId: number,
  clientY: number,
): DragState {
  const zoom = zoomOf(elements[from] ?? document.documentElement);
  const boxes = elements.map((element) => {
    const box = element.getBoundingClientRect();
    return { top: box.top / zoom, height: box.height / zoom };
  });
  const pitches = boxes.map((box, index) => {
    const next = boxes[index + 1];
    return next ? next.top - box.top : box.height;
  });
  elements[from]?.setAttribute("data-dragging", "");
  return { pointerId, zoom, from, to: from, originY: clientY / zoom, boxes, pitches, elements };
}

/**
 * Moves every item other than the dragged one out of the way of a target
 * position, by the dragged item's own pitch.
 *
 * @param state - The drag.
 */
export function makeRoom(state: DragState): void {
  const { from, to, pitches, elements } = state;
  const pitch = pitches[from] as number;
  for (const [index, element] of elements.entries()) {
    if (index === from) continue;
    let shift = 0;
    if (index > from && index <= to) shift = -pitch;
    if (index < from && index >= to) shift = pitch;
    element.style.transform = shift ? `translateY(${shift}px)` : "";
  }
}

/**
 * Where the gap the other items open for the dragged one begins, in the
 * document's pixels, for an outline that shows where it will land.
 *
 * @param state - The drag.
 */
export function gapTop(state: DragState): number {
  const { from, to, boxes, pitches } = state;
  const target = boxes[to] as GroupBox;
  return to > from ? target.top + (pitches[to] as number) - (pitches[from] as number) : target.top;
}

/**
 * Moves the dragged item with the pointer, and the others out of its way
 * where the position it would land at has changed.
 *
 * @param state - The drag.
 * @param clientY - Where the pointer stands, in the window's pixels.
 * @returns Whether the position it would land at changed.
 */
export function followPointer(state: DragState, clientY: number): boolean {
  const offset = clientY / state.zoom - state.originY;
  const dragged = state.elements[state.from];
  if (dragged) dragged.style.transform = `translateY(${offset}px)`;
  const to = dropIndex(state.boxes, state.from, offset);
  if (to === state.to) return false;
  state.to = to;
  makeRoom(state);
  return true;
}

/**
 * Ends a drag. Where the order did not change, every item goes back to its
 * place at once; where it did, the items keep where they were last seen, for
 * `travelHome` to carry them into the new order.
 *
 * @param state - The drag.
 * @returns The position the dragged item lands at.
 */
export function endDrag(state: DragState): number {
  state.elements[state.from]?.removeAttribute("data-dragging");
  if (state.to === state.from) for (const element of state.elements) element.style.transform = "";
  return state.to;
}

/**
 * Where each item stands on screen now, transforms included, to be passed to
 * `travelHome` once the new order is in the document.
 *
 * @param elements - The items.
 */
export function positionsOf(elements: Iterable<HTMLElement>): Map<HTMLElement, number> {
  return new Map([...elements].map((element) => [element, element.getBoundingClientRect().top]));
}

/**
 * Carries every item from where it was last seen into the place layout now
 * puts it.
 *
 * Runs once the new order is in the document and before the browser paints.
 * Each item's transform is dropped with the transition off, because dropping it
 * with the transition on would start a move from the old place in the old
 * order. The inverted offset is then written, layout is read once so the
 * browser takes it as the starting point, and clearing it lets the
 * stylesheet's transition carry the item home.
 *
 * @param previous - Where each item stood, as `positionsOf` measured it.
 */
export function travelHome(previous: ReadonlyMap<HTMLElement, number>): void {
  for (const [element, top] of previous) {
    if (!element.isConnected) continue;
    element.style.transition = "none";
    element.style.transform = "";
    const delta = (top - element.getBoundingClientRect().top) / zoomOf(element);
    if (Math.abs(delta) >= 0.5) element.style.transform = `translateY(${delta}px)`;
    element.getBoundingClientRect();
    element.style.transition = "";
    element.style.transform = "";
  }
}
