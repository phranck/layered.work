/**
 * The name closest to what somebody wrote.
 *
 * Three things ask this question: a component name, a parameter name, and the
 * name of a file in the media library. They ask it identically, so it is
 * answered here rather than three times, and the threshold below is part of the
 * answer rather than something each caller decides for itself.
 *
 * It lives outside the register because it is not about the register. The
 * register reads it, and so does the validator, and neither should have to
 * import the other to get at it.
 */

/**
 * The name nearest to what was written, when one is near enough to offer.
 *
 * Only a near miss is worth suggesting, which is the whole point: somebody who
 * wrote `VStac` gets `VStack`, and somebody who wrote `Carousel` gets nothing,
 * because being offered `Card` would be worse than being offered nothing.
 *
 * @param written - What was actually written.
 * @param names - The names to measure against.
 * @returns The nearest name, or nothing when none is close enough.
 */
export function nearestName(written: string, names: Iterable<string>): string | undefined {
  const lower = written.toLowerCase();
  let best: { name: string; distance: number } | undefined;

  for (const name of names) {
    const distance = editDistance(lower, name.toLowerCase());
    if (!best || distance < best.distance) best = { name, distance };
  }

  // A third of the length, so a short name tolerates one wrong letter and a
  // long one tolerates two. Beyond that a suggestion is a guess.
  return best && best.distance <= Math.max(1, Math.floor(written.length / 3)) ? best.name : undefined;
}

/**
 * How many single-character changes turn one string into the other.
 *
 * @param from - One string.
 * @param to - The other.
 * @returns The number of insertions, deletions, and substitutions between them.
 */
function editDistance(from: string, to: string): number {
  let previous = Array.from({ length: to.length + 1 }, (_, index) => index);

  for (let row = 1; row <= from.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= to.length; column += 1) {
      const substitution = (previous[column - 1] ?? 0) + (from[row - 1] === to[column - 1] ? 0 : 1);
      current[column] = Math.min(substitution, (previous[column] ?? 0) + 1, (current[column - 1] ?? 0) + 1);
    }
    previous = current;
  }

  return previous[to.length] ?? to.length;
}
