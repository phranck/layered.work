import { useEffect, useState } from "react";

/**
 * A value as it stood once it stopped changing for a moment.
 *
 * Something that follows typing, such as a preview asked of the API, reads this
 * rather than the value itself, so it asks once a pause comes rather than once
 * per key.
 *
 * @param value - The value as it is now.
 * @param delay - How long, in milliseconds, it has to stay the same.
 * @returns The value as it last stood still, which is the current one at first.
 */
export function useSettledValue<Value>(value: Value, delay: number): Value {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}
