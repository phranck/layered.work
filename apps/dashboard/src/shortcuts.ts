/**
 * How the dashboard reads its keyboard shortcuts: the platform's modifier with
 * one letter, and never while the reader is typing into a text field.
 *
 * Command is the modifier on an Apple platform and Control elsewhere. A
 * shortcut leaves a text field alone, because the same keystroke there may be
 * the reader's own.
 */

/** What a shortcut is read from. */
export type ShortcutEvent = Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">;

/** Input types that take no typed text, where a shortcut is free to act. */
const NON_TEXT_INPUTS = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

/**
 * Whether a key event is the platform's modifier with one letter and nothing
 * else: Command on an Apple platform, Control elsewhere.
 *
 * @param event - The keystroke.
 * @param letter - The letter, in lower case.
 * @param apple - Whether the modifier is Command rather than Control.
 */
export function isModifierShortcut(event: ShortcutEvent, letter: string, apple: boolean): boolean {
  const modifier = apple ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  return modifier && !event.altKey && !event.shiftKey && event.key.toLowerCase() === letter;
}

/**
 * Whether a key event is the search shortcut on this platform.
 *
 * @param event - The keystroke.
 * @param apple - Whether the modifier is Command rather than Control.
 */
export function isSearchShortcut(event: ShortcutEvent, apple: boolean): boolean {
  return isModifierShortcut(event, "k", apple);
}

/**
 * Whether an element takes typed text, so a shortcut must not take its keys.
 *
 * @param element - Whatever has focus.
 */
export function takesText(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable || element instanceof HTMLTextAreaElement) return true;
  return element instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(element.type);
}
