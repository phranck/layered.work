/**
 * The component register.
 *
 * One file describes every component; everything else reads it. `components.ts`
 * is that file, `kinds.ts` says what may be written in it, `props.ts` derives
 * the types a renderer receives, and `lookup.ts` answers the questions every
 * consumer asks of it. `describe.ts` says in words what the rest says in
 * types, for the two places that have to tell somebody: a refusal, and the
 * reference.
 */
export * from "./components.js";
export * from "./describe.js";
export * from "./kinds.js";
export * from "./lookup.js";
export * from "./props.js";
