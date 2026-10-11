import {
  createContext,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { ActionButton } from "./action-button.js";
import { beginDrag, type DragState, endDrag, followPointer, positionsOf, travelHome } from "./drag-order.js";
import "./reorder.css";

/**
 * Moving the items of a list by dragging their handle or by the arrow keys.
 *
 * The items register their element under their position, and a handle reads
 * every registered element's box when a drag starts, so the list never has to
 * be told how long it is and an item can be any element, a table row as much as
 * a block. While a drag runs the item follows the pointer and the others make
 * room for it, and once the list stands in its new order every item travels
 * into its new place, with the engine the sidebar's groups move with.
 *
 * The travel needs the new order in the document by the render after the move,
 * so a list whose order is stored by the API writes the new order into its
 * cache before the request returns.
 */

type Order = {
  move: (from: number, to: number) => void;
  elements: Map<number, HTMLElement>;
};
const Context = createContext<Order | null>(null);
function useOrder() {
  const value = useContext(Context);
  if (!value) throw new Error("Reorder requires its List or its Scope");
  return value;
}

/**
 * The order without an element of its own, for a list whose items already sit
 * in a container that must not gain a wrapper, such as the body of a table.
 *
 * @param onMove - Called with the position an item leaves and the one it takes.
 */
function Scope({ children, onMove }: { children: ReactNode; onMove: Order["move"] }) {
  const elements = useRef(new Map<number, HTMLElement>());
  /** Where each item stood when it last moved, for the travel into its new place. */
  const before = useRef<Map<HTMLElement, number> | undefined>(undefined);
  const move = useCallback(
    (from: number, to: number) => {
      before.current = positionsOf(elements.current.values());
      onMove(from, to);
    },
    [onMove],
  );
  // After every render, so the travel starts in the first one that shows the
  // new order, and before the browser paints it.
  useLayoutEffect(() => {
    const previous = before.current;
    if (!previous) return;
    before.current = undefined;
    travelHome(previous);
  });
  const value = useMemo(() => ({ move, elements: elements.current }), [move]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** The order, with a block around its items. */
function List({
  children,
  onMove,
  className,
}: {
  children: ReactNode;
  onMove: Order["move"];
  className?: string;
}) {
  return (
    <Scope onMove={onMove}>
      <div className={className}>{children}</div>
    </Scope>
  );
}

/**
 * The ref that registers an element as the item at a position, or nothing
 * outside an order, so a component used in ordered and unordered lists alike
 * can always ask for it. A registered element is marked, so its stylesheet can
 * give it the transition it travels with.
 *
 * @param index - The item's position. Undefined registers nothing.
 */
export function useReorderItem(index: number | undefined) {
  const order = useContext(Context);
  if (!order || index === undefined) return undefined;
  return (element: HTMLElement | null) => {
    if (element) {
      element.setAttribute("data-reorder-item", "");
      order.elements.set(index, element);
    } else {
      order.elements.delete(index);
    }
  };
}

/** An item of a list ordered by hand, as a block of its own. */
function Item({ index, children }: { index: number; children: ReactNode }) {
  return <div ref={useReorderItem(index)}>{children}</div>;
}

/**
 * The handle an item is moved by, at the item's start: dragged with the
 * pointer, or moved one place with the arrow keys.
 */
function Handle({ index, label, disabled }: { index: number; label: string; disabled?: boolean }) {
  const order = useOrder();
  const drag = useRef<DragState | null>(null);
  const finish = (event: PointerEvent<HTMLButtonElement>) => {
    const state = drag.current;
    drag.current = null;
    if (!state || state.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    const to = endDrag(state);
    if (to !== index) order.move(index, to);
  };
  return (
    <ActionButton.Icon
      action="move"
      className="reorder-handle"
      label={label}
      disabled={disabled}
      onPointerDown={(event) => {
        if (event.button !== 0 || disabled) return;
        const elements = Array.from({ length: order.elements.size }, (_, position) =>
          order.elements.get(position),
        );
        if (elements.some((element) => !element)) return;
        event.preventDefault();
        event.currentTarget.focus();
        drag.current = beginDrag(elements as HTMLElement[], index, event.pointerId, event.clientY);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const state = drag.current;
        if (state && state.pointerId === event.pointerId) followPointer(state, event.clientY);
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      onKeyDown={(event) => {
        const to = event.key === "ArrowUp" ? index - 1 : event.key === "ArrowDown" ? index + 1 : -1;
        if (to < 0 || to >= order.elements.size) return;
        event.preventDefault();
        order.move(index, to);
      }}
    />
  );
}
export const Reorder = Object.assign(List, { List, Scope, Item, Handle });
