import { z } from "zod";

/**
 * The shapes a request is built from, so that a route cannot be declared
 * without the constraints that make it safe.
 *
 * Every one of these exists because forgetting it is invisible. A string with
 * no maximum length accepts a megabyte, an object that tolerates unknown
 * properties accepts whatever the caller chose to send, and neither shows up as
 * a failure until somebody reads the value years later.
 */

/**
 * How long a string a request may carry, by what it is for.
 *
 * Named rather than written at each field, because the question "is 200 enough
 * for a title" should be answered once, where the answer can be seen next to
 * the others.
 */
export const MaxLength = {
  /** A slug, a code, a language tag: something machine-shaped. */
  Handle: 128,
  /** A title, a name, a label: one line a person wrote. */
  Line: 300,
  /** A summary, an alt text, a caption: a sentence or two. */
  Paragraph: 2_000,
  /** The body of an entry, which is the longest thing this API accepts. */
  Body: 500_000,
} as const;

/**
 * An object that refuses what it was not asked for.
 *
 * Zod drops unknown properties silently, which reads as safe and is not: the
 * caller learns nothing, and the next refactor may start reading a field that
 * was never validated because it was never declared. `.strict()` turns that
 * into a rejection.
 *
 * Every request body is declared through this rather than through `z.object`,
 * so the decision is made once instead of at every route.
 *
 * @param shape - The properties the body may carry.
 */
export function body<Shape extends z.ZodRawShape>(shape: Shape) {
  return z.strictObject(shape);
}

/**
 * A string that is bounded and not merely present.
 *
 * @param max - The longest it may be, from `MaxLength`.
 * @param options - `pattern` constrains its alphabet, which is required wherever
 *   the value reaches a path, a URL, a query or rendered output.
 */
export function text(max: number, options: { pattern?: RegExp } = {}) {
  const base = z.string().trim().min(1).max(max);
  return options.pattern ? base.regex(options.pattern) : base;
}
