/**
 * A `LIKE` pattern that finds the reader's text anywhere, taken literally.
 *
 * `%` and `_` are wildcards to Postgres and `\` is its escape character, so a
 * search for `100%` would otherwise match every row containing `100`. Each of
 * the three is escaped, and the text is wrapped in the wildcards that make it a
 * substring search.
 *
 * @param text - What the reader typed.
 * @returns A pattern for `LIKE` or `ILIKE` with the default escape character.
 */
export function containing(text: string): string {
  return `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}
