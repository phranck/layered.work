import { z } from "zod";
import { body, MaxLength, text } from "./request.js";
import { LISTED_KINDS } from "./settings.js";

/**
 * The name of a named value: a line of text defined once in the dashboard and
 * referred to from a body as `{{ name }}`.
 *
 * Stated here because three sides read it. The content language parses a
 * reference by it, the API refuses a name that breaks it, and the dashboard's
 * editor offers names in its shape, so none of them states it a second time.
 */

/**
 * A letter first, then lower-case letters and digits in runs joined by single
 * hyphens, as a written expression without anchors so a parser can embed it.
 */
export const VALUE_NAME_SOURCE = "[a-z][a-z0-9]*(?:-[a-z0-9]+)*";

/** The whole of a value's name, and nothing else. */
export const VALUE_NAME_PATTERN = new RegExp(`^${VALUE_NAME_SOURCE}$`);

/** The longest name a value may have. Long enough for a phrase, short enough to read inside a sentence. */
export const VALUE_NAME_MAX_LENGTH = 48;

/** One line with no line break inside it, which a value has to be to stand in a sentence. */
const SINGLE_LINE = /^[^\r\n]*$/;

/** A value's name as the API accepts it. */
const valueName = text(VALUE_NAME_MAX_LENGTH, { pattern: VALUE_NAME_PATTERN });

/** A value's text as the API accepts it: trimmed, not empty, one line. */
const valueText = text(MaxLength.Line, { pattern: SINGLE_LINE });

/** A new value. The name is given once here and never changes afterwards. */
export const createNamedValueBody = body({ name: valueName, value: valueText });
export type CreateNamedValueBody = z.infer<typeof createNamedValueBody>;

/** A changed value. Only the text, because a body refers to a value by its name. */
export const updateNamedValueBody = body({ value: valueText });
export type UpdateNamedValueBody = z.infer<typeof updateNamedValueBody>;

/**
 * One place that refers to a value, so the dashboard can say where a value is
 * used and why it cannot be deleted yet: an entry, by its title, or the
 * introduction of the posts or the projects overview.
 */
const namedValueUse = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("entry"), entryId: z.uuid(), title: z.string() }),
  z.object({ kind: z.literal("listing"), listing: z.enum(LISTED_KINDS) }),
]);
export type NamedValueUse = z.infer<typeof namedValueUse>;

/**
 * One value as the dashboard reads it.
 *
 * @property usedBy - Every entry with a translation whose body refers to it,
 *   drafts and the trash included, each once, and every overview whose
 *   introduction does.
 */
export const namedValue = z.object({
  id: z.uuid(),
  name: z.string(),
  value: z.string(),
  usedBy: z.array(namedValueUse),
});
export type NamedValue = z.infer<typeof namedValue>;
export const namedValueList = z.array(namedValue);
