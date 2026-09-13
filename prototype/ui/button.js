// A button: something the reader can do, with an icon saying what.
//
// Every action carries an icon. A word alone has to be read; an icon beside it
// is recognised before the word is, and the same icon on every screen makes the
// same action findable without reading at all. The icon's class is stated by
// the caller in full, because which family a project uses is the project's
// choice and not this package's.
//
// Three shapes and no flags beyond tone and size. What differs between them is
// the element, which a flag cannot change: a button acts, a link leads
// somewhere, and an inert mark sits inside something that is already a link.
//
// In the real project:
//
//   <Button tone="primary" icon={<FloppyDisk />}>Speichern</Button>
//   <Button.Link href="…" icon={<ArrowRight />}>Alle Beiträge</Button.Link>
//   <Button.Icon label="Bearbeiten" icon={<PencilSimple />} />

import { attrs, html } from "../shared/markup.js";

/** The classes for a tone and a size, shared by every shape. */
const classesFor = ({ tone, size }) =>
  ["button", `button--${tone}`, size === "small" && "button--small"].filter(Boolean).join(" ");

/** The icon, where there is one, and the label after it. */
const contents = ({ icon, label }) =>
  html`${icon && html`<i class="${icon}" aria-hidden="true"></i>`}${label}`;

/**
 * A button.
 *
 * @param label      What it does, as the reader reads it.
 * @param icon       The icon's class, family and name together.
 * @param tone       primary, secondary or danger. Secondary unless said
 *                   otherwise, because most buttons step back from the one that
 *                   carries the block's purpose.
 * @param size       "small" in a workbench, where every control shares a height.
 * @param attributes Extra attributes as an object, for the data the caller needs
 *                   on it.
 */
export const Button = ({ label, icon, tone = "secondary", size, attributes = {} } = {}) => html`
  <button class="${classesFor({ tone, size })}" type="button" ${attrs(attributes)}>${contents({ icon, label })}</button>
`;

/**
 * A button that leads somewhere.
 *
 * @param href Where it leads. The rest as for a Button.
 */
Button.link = ({ href, label, icon, tone = "secondary", size } = {}) => html`
  <a class="${classesFor({ tone, size })}" href="${href}">${contents({ icon, label })}</a>
`;

/**
 * A button that is an icon alone.
 *
 * The one place the unfilled style is right: the glyph itself says the thing
 * can be pressed, and a filled square for every pencil in a table would turn
 * the table into a grid of buttons. The label goes to assistive technology and
 * to the tooltip.
 */
Button.icon = ({ label, icon, attributes = {} } = {}) => html`
  <button
    class="button button--ghost button--icon"
    type="button"
    ${attrs({ "aria-label": label, title: label, ...attributes })}
  >
    <i class="${icon}" aria-hidden="true"></i>
  </button>
`;

/**
 * A button-shaped mark inside something that is already a link.
 *
 * A card that is one link cannot hold a second one, so the "read on" at its
 * foot is a mark rather than a control. It looks like the button it stands for
 * and is announced as part of the link around it.
 */
Button.inert = ({ label, icon, tone = "secondary", size } = {}) => html`
  <span class="${classesFor({ tone, size })}">${contents({ icon, label })}</span>
`;
