// The component package.
//
// Everything the site and the dashboard build their screens from. Both import
// from here, and the token scope each sits in decides how the result looks:
// nothing in this directory knows whether it is on a page or in a workbench.
//
// The one rule that keeps that true is the same one the tokens have. A component
// reads a semantic token and never a colour, a step of a ramp or a literal. The
// moment one of them names a value directly, it stops following the design in
// one of the two places and nobody notices until the other one moves.
//
// Every component here is a compound: the caller composes the parts it needs
// rather than switching them on with flags. That is what stops the set growing a
// boolean per variation, which is how the three separate card shapes that
// preceded this happened.

export { Button } from "./button.js";
export { Card } from "./card.js";
export { Choice, selectChoice } from "./choice.js";
export { Editor } from "./editor.js";
export { Field, Input, Segmented, Select, selectSegment, Switch } from "./field.js";
export { Logo } from "./logo.js";
export { Row, RowList } from "./row.js";
export { Section } from "./section.js";
export { Shortcut } from "./shortcut.js";
export { Sidebar } from "./sidebar.js";
