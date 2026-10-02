import { AppBar } from "@layered/ui";
import { createContext, type ReactNode, use, useState } from "react";
import { createPortal } from "react-dom";

/**
 * The dashboard's bar, and the way a screen puts something into it.
 *
 * The bar belongs to the frame, so it stays where it is whilst a screen
 * scrolls, but what it holds belongs to the screen: the way back from an open
 * entry, the entry's Save. A screen renders `HeaderStart` or `HeaderEnd`
 * wherever it likes, and the content appears in the bar through a portal. It is
 * still the screen's own element tree, so it reads the screen's state directly
 * and nothing has to be handed up to the frame and kept in step.
 */

/** The bar's places, once they exist in the document. */
interface Slots {
  start: HTMLElement | null;
  center: HTMLElement | null;
  end: HTMLElement | null;
}

const SlotsContext = createContext<Slots>({ start: null, center: null, end: null });

/**
 * The bar, and the places screens fill, for everything inside it.
 *
 * @param children - The rest of the frame, which renders the bar with
 *   `DashboardBar` wherever it belongs.
 */
export function AppBarSlotsProvider({ children }: { children: (bar: ReactNode) => ReactNode }) {
  const [start, setStart] = useState<HTMLElement | null>(null);
  const [center, setCenter] = useState<HTMLElement | null>(null);
  const [end, setEnd] = useState<HTMLElement | null>(null);
  const bar = (
    <AppBar>
      <AppBar.Start ref={setStart} />
      <AppBar.Center ref={setCenter} />
      <AppBar.End ref={setEnd} />
    </AppBar>
  );
  return <SlotsContext value={{ start, center, end }}>{children(bar)}</SlotsContext>;
}

/** Puts its children at the start of the bar: the way back, or where the reader is. */
export function HeaderStart({ children }: { children: ReactNode }) {
  const { start } = use(SlotsContext);
  return start ? createPortal(children, start) : null;
}

/** Puts its children in the centre of the bar: what just happened. */
export function HeaderCenter({ children }: { children: ReactNode }) {
  const { center } = use(SlotsContext);
  return center ? createPortal(children, center) : null;
}

/** Puts its children at the end of the bar: what the screen can do. */
export function HeaderEnd({ children }: { children: ReactNode }) {
  const { end } = use(SlotsContext);
  return end ? createPortal(children, end) : null;
}
