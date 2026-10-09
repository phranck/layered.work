import { VALUE_NAME_MAX_LENGTH, VALUE_NAME_SOURCE } from "@layered/schemas";

/**
 * A reference to a named value, as it is written in running text.
 *
 * `{{ name }}`: two opening braces, spaces or tabs if any, the name, spaces or
 * tabs, two closing braces. Anything else between the braces is text, which is
 * what leaves the mail templates' `{{formName}}` placeholders to the code that
 * fills them.
 *
 * The shape is stated here and nowhere else. The parser reads a reference by
 * it, the backend's search replaces references inside the database by it, and
 * the dashboard's completion recognizes one being typed by it.
 */

/** The blanks a reference allows on either side of the name. */
const BLANKS = "[ \\t]*";

/**
 * A reference as the source of a regular expression, around a source for the
 * name.
 *
 * Written in the syntax that JavaScript and PostgreSQL's regular expressions
 * read alike, because the search replaces references inside the database.
 *
 * @param name - What matches the name: one value's name, which needs no
 *   escaping because a name is letters, digits and hyphens, or a group that
 *   matches any name.
 */
export function valueReferenceSource(name: string): string {
  return `\\{\\{${BLANKS}${name}${BLANKS}\\}\\}`;
}

/** A reference at the very start of the text it is tested against. */
const VALUE_REFERENCE = new RegExp(`^${valueReferenceSource(`(${VALUE_NAME_SOURCE})`)}`);

/**
 * A reference still being typed, at the very end of a text: the opening
 * braces, blanks, and as much of a name as is there, which is the group.
 */
export const OPEN_VALUE_REFERENCE = new RegExp(`\\{\\{${BLANKS}([a-z0-9-]*)$`);

/**
 * A reference to a value as the dashboard writes one, with a space inside each
 * pair of braces.
 *
 * @param name - The value's name.
 */
export function writeValueReference(name: string): string {
  return `{{ ${name} }}`;
}

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
