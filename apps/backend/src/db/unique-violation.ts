/** What Postgres answers when a unique constraint already holds the value being written. */
const UNIQUE_VIOLATION = "23505";

/** How far down a chain of causes the driver's own error is looked for. */
const CAUSE_DEPTH = 5;

/**
 * Whether an error is Postgres refusing a row because one unique constraint
 * already holds its value.
 *
 * Drizzle wraps the driver's error, so the chain of causes is followed a few
 * steps, and a cycle in it ends the search rather than looping. Naming the
 * constraint keeps a violation of a different one, which is a defect rather
 * than a conflict the caller can resolve, from being answered as the expected
 * conflict.
 *
 * @param error - What was thrown.
 * @param constraint - The constraint's name, as the migration created it.
 */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  const seen = new Set<unknown>();
  let candidate = error;
  for (
    let depth = 0;
    depth < CAUSE_DEPTH && typeof candidate === "object" && candidate !== null;
    depth += 1
  ) {
    if (seen.has(candidate)) return false;
    seen.add(candidate);
    if (
      "code" in candidate &&
      candidate.code === UNIQUE_VIOLATION &&
      "constraint_name" in candidate &&
      candidate.constraint_name === constraint
    ) {
      return true;
    }
    candidate = "cause" in candidate ? candidate.cause : undefined;
  }
  return false;
}
