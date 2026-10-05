import { Button } from "@layered/ui";
import { DotsSixVerticalIcon } from "@layered/ui/icons";
import { createContext, type PointerEvent, type ReactNode, useContext, useMemo, useRef } from "react";
import { dropIndex, type GroupBox } from "./sidebar-order.js";

type Order = {
  move: (from: number, to: number) => void;
  count: number;
  elements: Map<number, HTMLDivElement>;
};
const Context = createContext<Order | null>(null);
function useOrder() {
  const value = useContext(Context);
  if (!value) throw new Error("Reorder requires its List");
  return value;
}
function List({
  children,
  count,
  onMove,
  className,
}: {
  children: ReactNode;
  count: number;
  onMove: Order["move"];
  className?: string;
}) {
  const elements = useRef(new Map<number, HTMLDivElement>());
  const value = useMemo(() => ({ move: onMove, count, elements: elements.current }), [onMove, count]);
  return (
    <Context.Provider value={value}>
      <div className={className}>{children}</div>
    </Context.Provider>
  );
}
function Item({ index, children }: { index: number; children: ReactNode }) {
  const order = useOrder();
  return (
    <div
      ref={(element) => {
        if (element) order.elements.set(index, element);
        else order.elements.delete(index);
      }}
    >
      {children}
    </div>
  );
}
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
        const boxes = Array.from({ length: order.count }, (_, i) => {
          const box = order.elements.get(i)?.getBoundingClientRect();
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
        if (to < 0 || to >= order.count) return;
        event.preventDefault();
        order.move(index, to);
      }}
    />
  );
}
export const Reorder = { List, Item, Handle };
