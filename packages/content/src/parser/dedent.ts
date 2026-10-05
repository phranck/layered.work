/**
 * Taking the indentation off a body, and putting the positions back afterwards.
 *
 * A body is written indented, because that is how a person reads a nested
 * structure. Markdown reads four spaces as a code block, so the indentation has
 * to come off before it sees the text, which is rule four of the grammar.
 *
 * Taking it off moves everything after the first line, so a position in the
 * shortened text is not a position in the document. Every message the validator
 * ever shows points at a line and a column, so the two have to be mapped back
 * exactly rather than approximately. That is what this does, and it is why the
 * mapping is a table of line starts rather than one subtraction: a blank line
 * and a line indented less than the rest both lose fewer characters than the
 * others, and a single offset would be wrong from there on.
 */

/** A body with its indentation removed, and the way back. */
export type Dedented = {
  /** The text as Markdown should see it. */
  text: string;
  /**
   * Turns a position in `text` into a position in the document.
   *
   * @param at - Where something is in the shortened text.
   * @returns Where it is in the document the body came from.
   */
  toDocument(at: number): number;
};

/**
 * Removes the indentation of the first non-blank line from every line.
 *
 * The first non-blank line rather than the smallest indentation of any line,
 * because the epic says so and because it is the rule a person can hold: what
 * you indent the first line by is what comes off. A line indented less than
 * that keeps whatever it has.
 *
 * @param body - The text between the braces.
 * @param offset - Where that text starts in the document.
 */
export function dedent(body: string, offset: number): Dedented {
  const lines = body.split("\n");
  const indent = bodyIndent(body);

  if (indent === 0) {
    return { text: body, toDocument: (at) => at + offset };
  }

  /** Where each line starts, in the shortened text and in the document. */
  const shortStarts: number[] = [];
  const documentStarts: number[] = [];

  let shortAt = 0;
  let documentAt = offset;
  const shortened: string[] = [];

  for (const line of lines) {
    // Only whitespace is removed, and never more of it than the line has.
    const removable = Math.min(indent, line.length - line.trimStart().length);
    const kept = line.slice(removable);

    shortStarts.push(shortAt);
    documentStarts.push(documentAt + removable);
    shortened.push(kept);

    shortAt += kept.length + 1;
    documentAt += line.length + 1;
  }

  return {
    text: shortened.join("\n"),
    toDocument(at: number) {
      // The line it falls on, found by walking back from the last start that is
      // not past it. A body is tens of lines, so a scan is quicker than the
      // arithmetic to avoid one.
      let index = shortStarts.length - 1;
      while (index > 0 && (shortStarts[index] ?? 0) > at) index -= 1;
      return (documentStarts[index] ?? offset) + (at - (shortStarts[index] ?? 0));
    },
  };
}

/**
 * How far the first non-blank line of a body is indented, in characters.
 *
 * This is the whole rule for what comes off a body, and the editor reads it from
 * here as well, so reindenting a document leaves every line of Markdown at the
 * same distance from the body's first line as the parser sees it.
 *
 * @param body - The text between the braces.
 * @returns The width of that line's leading whitespace, or 0 for a body with no
 *   text in it.
 */
export function bodyIndent(body: string): number {
  const first = body.split("\n").find((line) => line.trim() !== "");
  return first ? first.length - first.trimStart().length : 0;
}
