import { Button } from "@layered/ui";
import { DotsSixVerticalIcon } from "@layered/ui/icons";
import { createContext, type PointerEvent, type ReactNode, useContext, useMemo, useRef } from "react";
import { dropIndex, type GroupBox } from "./sidebar-order.js";
import "./reorder.css";

/**
 * Moving the items of a list by dragging their handle or by the arrow keys.
 *
 * The items register their element under their position, and a handle reads
 * every registered element's box when a drag starts, so the list never has to
 * be told how long it is and an item can be any element, a table row as much as
 * a block.
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
  const value = useMemo(() => ({ move: onMove, elements: elements.current }), [onMove]);
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
 * can always ask for it.
 *
 * @param index - The item's position. Undefined registers nothing.
 */
export function useReorderItem(index: number | undefined) {
  const order = useContext(Context);
  if (!order || index === undefined) return undefined;
  return (element: HTMLElement | null) => {
    if (element) order.elements.set(index, element);
    else order.elements.delete(index);
  };
}

/** An item of a list ordered by hand, as a block of its own. */
function Item({ index, children }: { index: number; children: ReactNode }) {
  return <div ref={useReorderItem(index)}>{children}</div>;
}

/**
 * The handle an item is moved by: dragged with the pointer, or moved one place
 * with the arrow keys.
 */
function Handle({ index, label, disabled }: { index: number; label: string; disabled?: boolean }) {
  const order = useOrder();
  const drag = useRef<{ pointer: number; y: number; boxes: GroupBox[] } | null>(null);
  const finish = (event: PointerEvent<HTMLButtonElement>) => {
    const state = drag.current;
    drag.current = null;
    if (!state || state.pointer !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    order.move(index, dropIndex(state.boxes, index, event.clientY - state.y));
  };
  return (
    <Button.Icon
      className="reorder-handle"
      label={label}
      icon={<DotsSixVerticalIcon />}
      disabled={disabled}
      onPointerDown={(event) => {
        if (event.button !== 0 || disabled) return;
        event.preventDefault();
        event.currentTarget.focus();
        const boxes = Array.from({ length: order.elements.size }, (_, position) => {
          const box = order.elements.get(position)?.getBoundingClientRect();
          return { top: box?.top ?? 0, height: box?.height ?? 0 };
        });
        drag.current = { pointer: event.pointerId, y: event.clientY, boxes };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerUp={finish}
      onPointerCancel={() => {
        drag.current = null;
      }}
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
