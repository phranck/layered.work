import { useState } from "react";

/**
 * A draft held against the stored value it was opened from: whether the two
 * still say the same thing, and when the stored value changed so the draft has
 * to start again from it.
 *
 * Both compare field by field. Serialising both sides builds two strings on
 * every render, and it compares the order keys were written in as well, so two
 * values holding the same pairs in another order would read as a change.
 */

/**
 * Whether two values a draft is made of say the same thing: the same text,
 * number, flag or null, or lists and objects holding equal values under the
 * same keys, in whatever order the keys were written.
 *
 * @param first - One value.
 * @param second - The other.
 */
export function sameValue(first: unknown, second: unknown): boolean {
  if (Object.is(first, second)) return true;
  if (typeof first !== "object" || typeof second !== "object" || first === null || second === null)
    return false;
  if (Array.isArray(first) !== Array.isArray(second)) return false;
  const firstFields = first as Record<string, unknown>;
  const secondFields = second as Record<string, unknown>;
  const keys = Object.keys(firstFields);
  return (
    keys.length === Object.keys(secondFields).length &&
    keys.every((key) => Object.hasOwn(secondFields, key) && sameValue(firstFields[key], secondFields[key]))
  );
}

/**
 * A number that goes up each time a stored value changes, compared by value.
 *
 * Given as the key of whatever holds a draft of that value, so the draft and
 * everything kept beside it start again exactly when what is stored changed:
 * after a save, or when a change made elsewhere arrives. A fetch that brings
 * the same value back, as a new object or in another order, keeps the number.
 *
 * @param value - The stored value the draft was opened from.
 * @returns The revision, starting at zero.
 */
export function useStoredRevision(value: unknown): number {
  const [seen, setSeen] = useState({ value, revision: 0 });
  if (sameValue(seen.value, value)) return seen.revision;
  const next = { value, revision: seen.revision + 1 };
  setSeen(next);
  return next.revision;
}
