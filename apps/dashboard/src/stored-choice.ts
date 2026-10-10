import { readStored, writeStored } from "@layered/ui/stored";
import { useCallback, useState } from "react";

/**
 * A choice this browser keeps between visits, such as the size of the
 * interface or whether a card was left open, held as state of the screen that
 * shows it.
 *
 * Each choice has its own key under the dashboard's prefix. Reading and writing
 * go through `@layered/ui/stored`, which the website uses too, so a browser that
 * refuses storage gets the default and keeps the choice for this visit only.
 */

/** What every key the dashboard keeps a choice under starts with, so none meets one of the website's. */
const STORED_CHOICE_PREFIX = "layered:dashboard:";

/**
 * Where one choice is kept: its name under the dashboard's prefix.
 *
 * @param name - The choice's own name, such as `sidebar-width`.
 */
export function storedChoiceKey(name: string): string {
  return `${STORED_CHOICE_PREFIX}${name}`;
}

/**
 * The step a stored value stands for, out of a set of named steps.
 *
 * @param steps - Every step there is.
 * @param stored - What storage holds, if anything.
 * @param fallback - The step without a choice. It is also the answer for a
 *   value that is no step, such as one removed since it was saved.
 */
export function restoredStep<Step extends string>(
  steps: readonly Step[],
  stored: string | null,
  fallback: Step,
): Step {
  return steps.find((step) => step === stored) ?? fallback;
}

/**
 * A kept choice and the way to change it.
 *
 * The choice is read once, when the screen first renders. A change applies at
 * once and is kept for the next visit.
 *
 * @param key - Where the choice is kept.
 * @param restore - The choice a stored value stands for, nothing stored included.
 * @param apply - Runs with every change, for a choice that acts outside React,
 *   such as an attribute on the document. Pass a function that keeps its
 *   identity, because the setter is rebuilt when it changes.
 * @returns The choice and its setter, as `useState` returns them.
 */
export function useStoredChoice<Choice extends string | boolean>(
  key: string,
  restore: (stored: string | null) => Choice,
  apply?: (choice: Choice) => void,
): [Choice, (choice: Choice) => void] {
  const [choice, setChoice] = useState(() => restore(readStored(key)));
  const choose = useCallback(
    (next: Choice) => {
      setChoice(next);
      apply?.(next);
      writeStored(key, String(next));
    },
    [key, apply],
  );
  return [choice, choose];
}
