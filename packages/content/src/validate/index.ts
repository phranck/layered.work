/**
 * The validator.
 *
 * `findings.ts` says what a finding is, `position.ts` turns an offset into the
 * line and column a person reads, and `validate.ts` is the walk over the tree
 * that produces them.
 */
export * from "./findings.js";
export * from "./position.js";
export * from "./validate.js";
