/**
 * The content language.
 *
 * Markdown covers prose. This adds a small vocabulary, shaped like SwiftUI, for
 * the things Markdown has no syntax for: a gallery, a three-dimensional model,
 * two columns, a note set apart from the text. An author composes from the same
 * components the site is built from rather than pasting markup into a body,
 * which is what the old site did and what made changing a viewer mean editing
 * every post that used one.
 *
 * One register defines every component, and the parser, the renderer, the
 * validator, the editor's completion and its highlighting all read from it.
 * Nothing about a component is written down twice.
 */
export * from "./parser/index.js";
export * from "./register/index.js";
