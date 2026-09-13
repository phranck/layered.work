// The one card in this design system.
//
// Before this existed there were three ways to build a surface with a heading
// and some content: `.layer` with its own parts on the site, `.table-card` with
// a head in the dashboard, and a handful of one-off blocks. Each new screen had
// to pick one, and the choice compounded until none of them was authoritative.
//
// This is a compound rather than a component with flags. The caller composes the
// parts it needs, so a card without a header is a card that was given no header,
// not a card with `header={false}`. The set therefore never grows a boolean per
// variation, which is what the third of those three shapes was on its way to.
//
// In the real project this becomes:
//
//   <Card>
//     <Card.Header title="…" actions={…} />
//     <Card.Body>…</Card.Body>
//     <Card.Footer note="…">…</Card.Footer>
//   </Card>
//
// The names and the rules below carry over unchanged; only the syntax differs.

import { attrs, html, raw } from "../shared/markup.js";

/**
 * A card.
 *
 * @param parts Whatever the card holds, in the order it should appear. A header
 *              and a footer are optional and a body usually is not, but nothing
 *              enforces that: a card holding one table and nothing else is a
 *              legitimate card. Something that has to reach the card's edges,
 *              such as a table, goes in as a part of its own rather than inside
 *              a body, because a body always pads what it holds.
 */
export const Card = (...parts) => html`<section class="card">${parts}</section>`;

/**
 * A card that is itself a target.
 *
 * Not a `clickable` flag on the ordinary card: a card you can open is a
 * different element, an anchor rather than a section, and a flag cannot change
 * that. Everything else about it is the same card.
 *
 * @param href  Where it leads.
 * @param parts The card's contents, as for any other card.
 */
Card.link = (href, ...parts) => html`<a class="card card--interactive" href="${href}">${parts}</a>`;

/**
 * A picture at the top of a card, reaching its edges.
 *
 * Its own part rather than something put inside the body, because it takes a
 * radius derived from its own inset and the body's padding would otherwise leave
 * a strip of card colour around it.
 */
Card.Media = ({ src, alt = "", ratio } = {}) => html`
  <div class="card__media" ${attrs({ style: ratio && `aspect-ratio: ${ratio}` })}>
    <img src="${src}" alt="${alt}" loading="lazy" />
  </div>
`;

/**
 * A caption under a picture.
 *
 * Its own part rather than text put in a body, because it brings its own padding
 * and so works in a flush card, where the body gives its padding up for the
 * picture. Centred, because it names the thing above it rather than beginning a
 * column of text.
 */
Card.Caption = (...children) => html`<figcaption class="card__caption">${children}</figcaption>`;

/**
 * The head of a card.
 *
 * Titles go here and nowhere else, which is what makes every card in the product
 * announce itself the same way. Actions belonging to the card as a whole sit at
 * the right of this row, because that is where a reader looks for what a block
 * can do before reading it.
 *
 * @param eyebrow A short label above the title, for the category of the thing.
 * @param title   The card's name.
 * @param meta    Something immediately beside the title, such as a count.
 * @param actions Controls for the card as a whole.
 */
Card.Header = ({ eyebrow, title, meta, actions } = {}) => html`
  <header class="card__header">
    <div class="card__heading">
      ${eyebrow && html`<p class="eyebrow">${eyebrow}</p>`}
      ${title &&
      html`
        <h2 class="card__title">
          ${title}
          ${meta && html`<span class="card__meta">${meta}</span>`}
        </h2>
      `}
    </div>
    ${actions && html`<div class="actions">${actions}</div>`}
  </header>
`;

/** The body of a card: whatever it is actually for. */
Card.Body = (...children) => html`<div class="card__body">${children}</div>`;

/**
 * A body that lays its children out in a column with the card's own gap.
 *
 * The common case, split out so that every form-shaped card does not restate the
 * same three flex properties.
 */
Card.Stack = (...children) => html`<div class="card__body card__body--stack">${children}</div>`;

/**
 * The foot of a card.
 *
 * Buttons belonging to the card sit here, at its right edge, with the one that
 * carries the card's purpose furthest right. A note about the card as a whole
 * sits at the left of the same row, where it is read before the buttons rather
 * than after them.
 *
 * @param note    A hint that applies to the whole card.
 * @param actions Buttons, in order of weight with the primary one last.
 */
Card.Footer = ({ note, actions } = {}) => html`
  <footer class="card__footer">
    ${note ? html`<p class="card__note">${note}</p>` : raw("")}
    ${actions && html`<div class="actions">${actions}</div>`}
  </footer>
`;
