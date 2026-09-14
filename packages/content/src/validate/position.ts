/**
 * Turning an offset into a line and a column.
 *
 * The parser works in offsets, because that is what a tree holds and what an
 * editor underlines. A person reads a line and a column, and says them aloud
 * when reporting a problem. Both are counted from one, because that is what
 * every editor's gutter and every compiler says, and a validator that counted
 * from zero would make its reader do arithmetic before they could look.
 */

/** Where something is, as a person reads it. */
export type Place = {
  /** Which line, counting from one. */
  line: number;
  /** Which character of that line, counting from one. */
  column: number;
};

/**
 * Builds the lookup for one document.
 *
 * The line starts are found once and searched per question, rather than counted
 * from the beginning each time: a document with a hundred findings would
 * otherwise be read a hundred times over.
 *
 * @param text - The document.
 * @returns A function from an offset in that document to its place in it. An
 *   offset past the end is reported as the end, because a finding is never more
 *   useful for being refused.
 */
export function placesIn(text: string): (offset: number) => Place {
  const starts = [0];
  for (let at = text.indexOf("\n"); at !== -1; at = text.indexOf("\n", at + 1)) {
    starts.push(at + 1);
  }

  return (offset) => {
    const at = Math.max(0, Math.min(offset, text.length));

    // The last line that starts at or before the offset.
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if ((starts[middle] ?? 0) <= at) low = middle;
      else high = middle - 1;
    }

    return { line: low + 1, column: at - (starts[low] ?? 0) + 1 };
  };
}
