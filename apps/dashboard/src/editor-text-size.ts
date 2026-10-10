import { restoredStep, storedChoiceKey, useStoredChoice } from "./stored-choice.js";

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
export const EDITOR_TEXT_SIZE_KEY = storedChoiceKey("editor-text-size");

/** The size without a choice, which is the code size. */
const DEFAULT_SIZE: EditorTextSize = "s";

/**
 * The size a stored value stands for. Anything that is not one of the steps,
 * such as a step removed since it was saved, is the default.
 *
 * @param stored - What storage holds, if anything.
 */
export function restoredTextSize(stored: string | null): EditorTextSize {
  return restoredStep(EDITOR_TEXT_SIZES, stored, DEFAULT_SIZE);
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

/**
 * The chosen size and the way to change it. A change applies at once and is
 * kept for the next visit.
 */
export function useEditorTextSize(): [EditorTextSize, (size: EditorTextSize) => void] {
  return useStoredChoice(EDITOR_TEXT_SIZE_KEY, restoredTextSize);
}
