import { VALUE_NAME_MAX_LENGTH, VALUE_NAME_SOURCE } from "@layered/schemas";

/**
 * A reference to a named value, as it is written in running text.
 *
 * `{{ name }}`: two opening braces, spaces or tabs if any, the name, spaces or
 * tabs, two closing braces. Anything else between the braces is text, which is
 * what leaves the mail templates' `{{formName}}` placeholders to the code that
 * fills them.
 */

/** A reference at the very start of the text it is tested against. */
const VALUE_REFERENCE = new RegExp(`^\\{\\{[ \\t]*(${VALUE_NAME_SOURCE})[ \\t]*\\}\\}`);

/** One reference as it was written. */
export interface WrittenValueReference {
  /** How many characters the reference covers, braces included. */
  length: number;
  /** Where the name starts, counted from the first brace. */
  nameFrom: number;
  /** The name, as the value is stored under it. */
  name: string;
}

/**
 * Reads a reference at the start of a text.
 *
 * @param text - The text from the first brace on.
 * @returns The reference, or null where the text does not start with one,
 *   including where the name is longer than any value may be named.
 */
export function readValueReference(text: string): WrittenValueReference | null {
  const match = VALUE_REFERENCE.exec(text);
  const name = match?.[1];
  if (!match || !name || name.length > VALUE_NAME_MAX_LENGTH) return null;
  return { length: match[0].length, nameFrom: match[0].indexOf(name), name };
}
