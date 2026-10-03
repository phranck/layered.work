import { useCallback, useState } from "react";

/**
 * The text size of the writing surface, which the author chooses in the
 * editor's toolbar and which this browser keeps between visits.
 *
 * The steps are named here and sized in `editor.css`, where each is a step of
 * the type scale from the code size upwards. `s` is the code size the surface
 * has without a choice.
 */

/** The steps, smallest first. */
export const EDITOR_TEXT_SIZES = ["s", "m", "l", "xl"] as const;
export type EditorTextSize = (typeof EDITOR_TEXT_SIZES)[number];

/** Where the choice is kept, beside the sidebar's width and order. */
export const EDITOR_TEXT_SIZE_KEY = "layered:dashboard:editor-text-size";

/** The size without a choice, which is the code size. */
const DEFAULT_SIZE: EditorTextSize = "s";

/**
 * The size a stored value stands for. Anything that is not one of the steps,
 * such as a step removed since it was saved, is the default.
 *
 * @param stored - What storage holds, if anything.
 */
export function restoredTextSize(stored: string | null): EditorTextSize {
  return EDITOR_TEXT_SIZES.find((size) => size === stored) ?? DEFAULT_SIZE;
}

/**
 * The step beside a size, or the size itself at either end.
 *
 * @param size - The current step.
 * @param direction - One step larger, or one smaller.
 */
export function steppedTextSize(size: EditorTextSize, direction: 1 | -1): EditorTextSize {
  return EDITOR_TEXT_SIZES[EDITOR_TEXT_SIZES.indexOf(size) + direction] ?? size;
}

/** Storage, where the browser allows it. A private window may refuse. */
function readStored(): string | null {
  try {
    return window.localStorage.getItem(EDITOR_TEXT_SIZE_KEY);
  } catch {
    return null;
  }
}

/**
 * The chosen size and the way to change it. A change applies at once and is
 * kept for the next visit.
 */
export function useEditorTextSize(): [EditorTextSize, (size: EditorTextSize) => void] {
  const [size, setSize] = useState(() => restoredTextSize(readStored()));
  const choose = useCallback((next: EditorTextSize) => {
    setSize(next);
    try {
      window.localStorage.setItem(EDITOR_TEXT_SIZE_KEY, next);
    } catch {
      // A size that cannot be kept is still the size for this visit.
    }
  }, []);
  return [size, choose];
}
