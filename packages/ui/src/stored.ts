/**
 * Choices a browser keeps between visits, in local storage, for the website and
 * for the dashboard alike.
 *
 * Storage can refuse, as a private window or a blocked site may, and then
 * reading finds nothing and writing keeps nothing. A choice that cannot be kept
 * is still the choice for the page it was made on, so neither refusal is an
 * error for the caller.
 */

/**
 * What storage holds under a key.
 *
 * @param key - Where the value is kept.
 * @returns The stored text, or null where nothing is stored or storage refuses.
 */
export function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Keeps a value under a key, where storage allows it.
 *
 * @param key - Where the value is kept.
 * @param value - The text to keep.
 */
export function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Nothing is kept, and the choice still holds on this page.
  }
}
