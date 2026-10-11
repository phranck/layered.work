import { AppBar, Button } from "@layered/ui";
import { ArrowLeftIcon } from "@layered/ui/icons";
import { createContext, type ReactNode, use, useState } from "react";
import { createPortal } from "react-dom";
import { useLinkClickHandler } from "react-router";
import { useDashboardLanguage } from "./language-context.js";
import type { DashboardArea } from "./routes.js";

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

/** The heading in the bar, naming the screen or the item open in it. */
function BarTitle({ title }: { title: string }) {
  return <h1 className="app-bar-title">{title}</h1>;
}

/**
 * A screen's heading, at the start of the bar, where an open entry shows its
 * title after the way back. The content below begins with what the screen
 * holds rather than with its name.
 *
 * @param title - What the screen is called.
 */
export function ScreenTitle({ title }: { title: string }) {
  return (
    <HeaderStart>
      <BarTitle title={title} />
    </HeaderStart>
  );
}

/**
 * The way back from an item to the list it belongs to, at the start of the
 * bar, with the item's title after it. Every editor that opens one item of a
 * list leaves by it, so the end of the bar holds only what can be done to the
 * item. It is a link, so it can be opened in a new tab, and a plain click stays
 * in the dashboard, where an editor holding unsaved changes can still ask first.
 *
 * @param area - The list the item belongs to, whose address the link leads to
 *   and whose name it reads.
 * @param title - The open item's title. Left out where there is no item to
 *   name, such as after it failed to load.
 */
export function BackToList({ area, title }: { area: DashboardArea; title?: string }) {
  const { text } = useDashboardLanguage();
  const to = `/${area.path}`;
  const onClick = useLinkClickHandler(to);
  return (
    <HeaderStart>
      <Button.Link href={to} onClick={onClick} icon={<ArrowLeftIcon />}>
        {text(area.labelKey)}
      </Button.Link>
      {title !== undefined && <BarTitle title={title} />}
    </HeaderStart>
  );
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
