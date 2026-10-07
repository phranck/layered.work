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
