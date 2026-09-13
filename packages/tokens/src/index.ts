/**
 * The design token system.
 *
 * The values live in the four stylesheets beside this file, and
 * `index.css` is the whole system in one import:
 *
 * ```css
 * @import "@layered/tokens/index.css";
 * ```
 *
 * The layers, in the order they build on each other: `scale.css` holds every
 * stepped series and not one colour, `palettes.css` holds the colour worlds,
 * `semantic.css` holds what follows from those two and is what components read,
 * and `workbench.css` holds the dashboard's density.
 *
 * The rule that holds it together is that a component names a semantic token
 * and never a colour, a step of a ramp, or a literal. `README.md` beside this
 * file explains why, and carries the two resolution traps that each cost a
 * working day to find.
 *
 * **Nothing here restates a value.** What TypeScript needs is derived from the
 * same stylesheets by `scripts/derive.mjs`, which the build runs. A value typed
 * out a second time would drift the first time somebody changed the scale, and
 * nothing would report it: a component would simply offer a step the stylesheet
 * has no property for.
 */
export * from "./generated/scales.js";
