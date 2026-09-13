/**
 * The schemas both sides validate against.
 *
 * A route declares its schema here and the dashboard's form reads the same one,
 * so a form and its endpoint cannot disagree about what is acceptable. The API
 * description is generated from these rather than written by hand.
 *
 * **This package is resolved from source whilst working and from `dist` when it
 * runs.** `package.json` names three conditions for that: `types` and
 * `development` both point here, so a type check and a test suite work whether
 * or not anything has been built, and `default` points at the compiled output,
 * which is what Node loads because it asks for neither of the first two.
 *
 * Without the middle one, the suite silently shrinks to whichever files do not
 * import this package until somebody runs a build, and a type check becomes a
 * step that has to come after one.
 */

export * from "./auth.js";
export * from "./errors.js";
export * from "./request.js";
