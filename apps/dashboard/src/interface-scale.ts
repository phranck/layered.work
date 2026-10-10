import { readStored } from "@layered/ui/stored";
import { restoredStep, storedChoiceKey, useStoredChoice } from "./stored-choice.js";

/**
 * The size of the whole dashboard, which the author chooses in the account
 * dialog and which this browser keeps between visits.
 *
 * The steps are named here and sized in `app.css`, where each one zooms the
 * document by its own factor. `m` is the size the dashboard has without a
 * choice. The choice belongs to the browser rather than to the account,
 * because the right size depends on the screen the dashboard is shown on.
 */

/** The steps, smallest first. */
export const INTERFACE_SCALES = ["s", "m", "l", "xl"] as const;
export type InterfaceScale = (typeof INTERFACE_SCALES)[number];

/** Where the choice is kept, beside the sidebar's width and the editor's text size. */
export const INTERFACE_SCALE_KEY = storedChoiceKey("interface-scale");

/** The attribute on the root element that `app.css` sizes the document by. */
const SCALE_ATTRIBUTE = "data-interface-scale";

/** The size without a choice. */
const DEFAULT_SCALE: InterfaceScale = "m";

/**
 * The step a stored value stands for. Anything that is not one of the steps,
 * such as a step removed since it was saved, is the default.
 *
 * @param stored - What storage holds, if anything.
 */
export function restoredScale(stored: string | null): InterfaceScale {
  return restoredStep(INTERFACE_SCALES, stored, DEFAULT_SCALE);
}

/**
 * Sizes the document by a step.
 *
 * @param scale - The step to show the dashboard at.
 * @param root - The element `app.css` reads the step from, which is the document's root.
 */
export function applyInterfaceScale(
  scale: InterfaceScale,
  root: HTMLElement = document.documentElement,
): void {
  root.setAttribute(SCALE_ATTRIBUTE, scale);
}

/**
 * Sizes the document by the step this browser keeps.
 *
 * Called before the first render, so the dashboard appears at its size rather
 * than jumping to it once React has mounted.
 */
export function applyStoredInterfaceScale(): void {
  applyInterfaceScale(restoredScale(readStored(INTERFACE_SCALE_KEY)));
}

/**
 * The factor the interface scale enlarges an element by.
 *
 * Pointer coordinates and `getBoundingClientRect` are in the window's pixels,
 * while a length written into a style is multiplied by the zoom. Code that
 * turns a pointer's travel into a written length divides by this first. One
 * where the browser reports no zoom, as a test environment does.
 *
 * @param element - The element the length is written to, or one sharing its zoom.
 */
export function zoomOf(element: Element): number {
  const zoom = element.currentCSSZoom;
  return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
}

/**
 * The chosen step and the way to change it. A change applies at once and is
 * kept for the next visit.
 */
export function useInterfaceScale(): [InterfaceScale, (scale: InterfaceScale) => void] {
  return useStoredChoice(INTERFACE_SCALE_KEY, restoredScale, applyInterfaceScale);
}
