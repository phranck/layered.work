/**
 * The schemas both sides validate against.
 *
 * A route declares its schema here and the dashboard's form reads the same one,
 * so a form and its endpoint cannot disagree about what is acceptable. The API
 * description is generated from these rather than written by hand.
 *
 * Filled by the API epic.
 */
export const SCHEMAS_PACKAGE = "@layered/schemas" as const;
