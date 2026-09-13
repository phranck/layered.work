// A row: something with a mark at the front, a name, and controls at the end.
//
// Before this there were five of them. A sidebar entry, a landing block, a
// social account, a footer navigation and a search result were all written
// separately, and all five were the same three columns: a lead, a text block
// that shortens, and whatever the row can do.
//
// They differ in what goes in those columns, not in the columns, which is why
// this is a compound: the caller fills the parts it has. A row with no lead is a
// row that was given none.
//
// In the real project:
//
//   <Row>
//     <Row.Lead><Icon … /></Row.Lead>
//     <Row.Text title="…" note="…" />
//     <Row.Meta>12</Row.Meta>
//     <Row.Actions>…</Row.Actions>
//   </Row>

import { attrs, html } from "../shared/markup.js";

/**
 * A row.
 *
 * @param parts Lead, text, meta and actions, in that order. All optional.
 */
export const Row = (...parts) => html`<div class="row">${parts}</div>`;

/**
 * A row that can be opened.
 *
 * A button rather than a div with a click handler, so the keyboard reaches it,
 * a screen reader announces it as something to press, and the focus ring is the
 * one the platform draws.
 *
 * @param attributes Extra attributes as an object, for the data the caller needs
 *                   on it. An object rather than a string, because the tag
 *                   escapes what it interpolates and would turn the quotes
 *                   around a value into part of the value.
 */
Row.button = (attributes = {}, ...parts) =>
  html`<button class="row row--interactive" type="button" ${attrs(attributes)}>${parts}</button>`;

/** A row that leads somewhere. */
Row.link = (href, ...parts) => html`<a class="row row--interactive" href="${href}">${parts}</a>`;

/**
 * A row inside something that already pads and frames it, such as a table cell
 * or the head of a bordered group. It keeps the three columns and gives up the
 * box around them.
 */
Row.bare = (...parts) => html`<div class="row row--bare">${parts}</div>`;

/**
 * The mark at the front of a row.
 *
 * An icon, a thumbnail, a logo, a drag handle. It never shrinks, because the
 * thing that gives way when a row is too narrow is the text.
 */
Row.Lead = (...children) => html`<span class="row__lead">${children}</span>`;

/**
 * A lead framed as a tile.
 *
 * For an icon that needs to read as an object rather than as a glyph beside
 * text, which is the difference between a list of sections and a list of things.
 */
Row.Tile = (...children) => html`<span class="row__lead row__tile">${children}</span>`;

/**
 * The handle by which a row is dragged into another place.
 *
 * A lead, since it sits at the front, but hidden from assistive technology: it
 * says nothing about the row, and the reorder it offers is a pointer gesture.
 * The caller supplies the glyph, because the icon family is the project's
 * choice.
 */
Row.Grip = (...children) => html`<span class="row__lead row__grip" aria-hidden="true">${children}</span>`;

/**
 * The name of the row, and a second line under it.
 *
 * Neither line ever wraps. A row whose text wraps changes its own height and
 * nothing else's, which makes the whole list read as misaligned, so what does
 * not fit is shortened instead.
 *
 * @param title The name.
 * @param note  A second line, quieter.
 */
Row.Text = ({ title, note } = {}) => html`
  <span class="row__text">
    ${title && html`<span class="row__title">${title}</span>`}
    ${note && html`<span class="row__note">${note}</span>`}
  </span>
`;

/**
 * A figure or a tag at the end of the text, before the actions.
 *
 * It says something about the row rather than doing something to it, which is
 * why it is not in the actions.
 */
Row.Meta = (...children) => html`<span class="row__meta">${children}</span>`;

/** What the row can do. Pushed to the end, as everywhere else in this design. */
Row.Actions = (...children) => html`<span class="row__actions actions">${children}</span>`;

/**
 * A list of rows, divided or not.
 *
 * @param parts The rows.
 */
export const RowList = (...parts) => html`<div class="row-list">${parts}</div>`;

/** A list whose rows are separated by a hairline. */
RowList.divided = (...parts) => html`<div class="row-list row-list--divided">${parts}</div>`;
