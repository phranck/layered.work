import { isApplePlatform } from "@layered/ui";
import { createContext, type ReactNode, use, useEffect, useEffectEvent, useMemo, useRef } from "react";
import { isModifierShortcut } from "./search.js";

/**
 * Saving on the same shortcut everywhere.
 *
 * Command-S on an Apple platform and Control-S elsewhere runs whatever the
 * screen's Save button runs. A screen that can save registers that action; the
 * one registered last is the one run, so a dialog opened over an editor saves
 * the dialog rather than the entry behind it.
 *
 * The shortcut is taken from the browser everywhere in the dashboard, also where
 * nothing can be saved, because its own Save Page dialog is never what a reader
 * of the dashboard means.
 */

/** Registers a save, and returns what unregisters it. */
type Register = (save: () => void) => () => void;

const SaveShortcutContext = createContext<Register | null>(null);

/**
 * Listens for the shortcut for everything inside it.
 *
 * @param children - The dashboard's frame.
 */
export function SaveShortcutProvider({ children }: { children: ReactNode }) {
  const saves = useRef<(() => void)[]>([]);

  useEffect(() => {
    const apple = isApplePlatform();
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isModifierShortcut(event, "s", apple)) return;
      event.preventDefault();
      saves.current.at(-1)?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const register = useMemo<Register>(
    () => (save) => {
      saves.current.push(save);
      return () => {
        saves.current = saves.current.filter((entry) => entry !== save);
      };
    },
    [],
  );

  return <SaveShortcutContext value={register}>{children}</SaveShortcutContext>;
}

/**
 * Makes the shortcut run this screen's save for as long as the screen is shown.
 *
 * The latest `save` is always the one run, so it may close over the current
 * draft. It should do exactly what the Save button does, including returning
 * without effect where the button is disabled.
 *
 * @param save - What the Save button runs.
 */
export function useSaveShortcut(save: () => void): void {
  const register = use(SaveShortcutContext);
  const run = useEffectEvent(save);
  useEffect(() => register?.(() => run()), [register]);
}
