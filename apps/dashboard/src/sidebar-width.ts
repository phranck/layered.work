import {
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

/**
 * The sidebar's width, which the reader sets by dragging its edge.
 *
 * The bounds and the default live in `workbench.css` as `--sidebar-min`,
 * `--sidebar-max` and `--sidebar-width`, and this module reads them from the
 * workbench element rather than stating them again, so the stylesheet and the
 * drag cannot disagree about how narrow the sidebar may get. A drag writes one
 * custom property per pointer move and the grid track reads it, so the browser
 * does the arithmetic.
 */

/** Where the chosen width is kept between visits. */
export const SIDEBAR_WIDTH_KEY = "layered:dashboard:sidebar-width";

/** How far one press of an arrow key moves the edge, in pixels. */
const KEYBOARD_STEP = 16;

/** The three widths the stylesheet declares, in pixels. */
export interface SidebarBounds {
  min: number;
  max: number;
  initial: number;
}

/**
 * A width held inside the bounds.
 *
 * @param width - Any width in pixels.
 * @param bounds - The workbench's declared bounds.
 * @returns The nearest whole width the bounds allow.
 */
export function clampWidth(width: number, bounds: SidebarBounds): number {
  return Math.round(Math.min(bounds.max, Math.max(bounds.min, width)));
}

/**
 * The width a stored value stands for.
 *
 * A value that is missing or is not a number falls back to the default, and
 * one outside the bounds is clamped, because the bounds may have moved since it
 * was saved.
 *
 * @param stored - What storage holds, if anything.
 * @param bounds - The workbench's declared bounds.
 */
export function restoredWidth(stored: string | null, bounds: SidebarBounds): number {
  const width = Number(stored);
  if (stored === null || stored.trim() === "" || !Number.isFinite(width)) return bounds.initial;
  return clampWidth(width, bounds);
}

/** Reads the bounds from the element that declares them. */
function readBounds(element: HTMLElement): SidebarBounds | undefined {
  const style = getComputedStyle(element);
  const pixels = (name: string) => Number.parseFloat(style.getPropertyValue(name));
  const bounds = {
    min: pixels("--sidebar-min"),
    max: pixels("--sidebar-max"),
    initial: pixels("--sidebar-width"),
  };
  return Object.values(bounds).every(Number.isFinite) ? bounds : undefined;
}

/** Storage, where the browser allows it. A private window may refuse. */
function readStored(): string | null {
  try {
    return window.localStorage.getItem(SIDEBAR_WIDTH_KEY);
  } catch {
    return null;
  }
}

function writeStored(width: number): void {
  try {
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
  } catch {
    // A width that cannot be kept is still the width for this visit.
  }
}

/** What the drag handle needs to be a working, focusable separator. */
export interface SidebarHandleProps {
  tabIndex: number;
  "aria-valuemin": number | undefined;
  "aria-valuemax": number | undefined;
  "aria-valuenow": number | undefined;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}

/**
 * Lets the reader resize the sidebar, and remembers the width they leave it at.
 *
 * The width is written as `--sidebar-width` on the workbench element, which is
 * where the stylesheet declares it, so the inline value replaces the default
 * for that element and nothing else.
 *
 * @param workbench - The element that declares the bounds and holds the grid.
 * @returns Props for the drag handle.
 */
export function useSidebarWidth(workbench: RefObject<HTMLElement | null>): SidebarHandleProps {
  const [bounds, setBounds] = useState<SidebarBounds>();
  const [width, setWidth] = useState<number>();
  const drag = useRef<{ startX: number; startWidth: number } | undefined>(undefined);

  const apply = useCallback(
    (next: number) => {
      workbench.current?.style.setProperty("--sidebar-width", `${next}px`);
      setWidth(next);
    },
    [workbench],
  );

  useEffect(() => {
    const element = workbench.current;
    if (!element) return;
    const declared = readBounds(element);
    if (!declared) return;
    setBounds(declared);
    apply(restoredWidth(readStored(), declared));
  }, [workbench, apply]);

  const finish = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = undefined;
    workbench.current?.removeAttribute("data-resizing");
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (width !== undefined) writeStored(width);
  };

  return {
    tabIndex: 0,
    "aria-valuemin": bounds?.min,
    "aria-valuemax": bounds?.max,
    "aria-valuenow": width,
    onPointerDown(event) {
      if (!bounds || width === undefined || event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { startX: event.clientX, startWidth: width };
      workbench.current?.setAttribute("data-resizing", "");
    },
    onPointerMove(event) {
      if (!drag.current || !bounds) return;
      apply(clampWidth(drag.current.startWidth + event.clientX - drag.current.startX, bounds));
    },
    onPointerUp: finish,
    onPointerCancel: finish,
    onKeyDown(event) {
      if (!bounds || width === undefined) return;
      const next =
        event.key === "ArrowLeft"
          ? width - KEYBOARD_STEP
          : event.key === "ArrowRight"
            ? width + KEYBOARD_STEP
            : event.key === "Home"
              ? bounds.min
              : event.key === "End"
                ? bounds.max
                : undefined;
      if (next === undefined) return;
      event.preventDefault();
      const clamped = clampWidth(next, bounds);
      apply(clamped);
      writeStored(clamped);
    },
  };
}
