// A section: a heading and what belongs under it.
//
// This is the most reused shape in the whole product. It is the same thing in
// three places that look nothing alike:
//
//   the site        an eyebrow, a large title, an optional link, then a grid
//   the workbench   a rubric, a title, buttons, then panels
//   the sidebar     a small capitalised label, then a list of entries
//
// Each of those was written separately before, with its own class names and its
// own idea of where the title sits relative to the actions. They are one
// component with three token scopes.
//
// In the real project:
//
//   <Section>
//     <Section.Title eyebrow="…" title="…" actions={…} />
//     <Section.Body>…</Section.Body>
//   </Section>

import { attrs, html } from "../shared/markup.js";

/**
 * A section.
 *
 * @param parts A title and a body, in that order. Both are optional: a section
 *              with only a body is a group of things with no announcement, and a
 *              section with only a title introduces what follows it in the flow.
 */
export const Section = (...parts) => html`<section class="section">${parts}</section>`;

/**
 * A section at page rhythm, with the space above and below a page section wants.
 *
 * The plain section brings no outer spacing, because inside a card or a sidebar
 * that spacing comes from the container. On a page it has to come from
 * somewhere, and this is where.
 */
Section.page = (...parts) => html`<section class="section section--page">${parts}</section>`;

/**
 * The heading of a section.
 *
 * The eyebrow says what kind of thing follows, the title says which one, and the
 * actions sit at the right of the same row. That order is fixed across the
 * product, which is what lets a reader find the same information in the same
 * place on every screen.
 *
 * @param lead       Something immediately before the heading, such as a drag
 *                   handle. It belongs inside the left group, not beside it:
 *                   the row spreads its children apart, so a second top-level
 *                   child would push the title to the far edge.
 * @param eyebrow    A short label above the title.
 * @param title      The section's name.
 * @param level      Heading level, 2 by default. A page that already has an h1
 *                   elsewhere does not get a second one here.
 * @param actions    Controls belonging to the section as a whole.
 * @param attributes Extra attributes on the header as an object, for the data a
 *                   caller needs on it.
 */
Section.Title = ({ lead, eyebrow, title, level = 2, actions, attributes = {} } = {}) => html`
  <header class="section__title" ${attrs(attributes)}>
    <div class="section__start">
      ${lead}
      <div class="section__heading">
        ${eyebrow && html`<p class="eyebrow">${eyebrow}</p>`}
        ${title && html`<h${level} class="section__name">${title}</h${level}>`}
      </div>
    </div>
    ${actions && html`<div class="actions">${actions}</div>`}
  </header>
`;

/**
 * A section title at display size, for the top of a page.
 *
 * Same structure, larger type. It is a variant rather than a component of its
 * own, because the difference is entirely a matter of scale.
 */
Section.Lead = ({ eyebrow, title, actions } = {}) => html`
  <header class="section__title section__title--lead">
    <div class="section__start">
      <div class="section__heading">
        ${eyebrow && html`<p class="eyebrow">${eyebrow}</p>`}
        ${title && html`<h1 class="section__name">${title}</h1>`}
      </div>
    </div>
    ${actions && html`<div class="actions">${actions}</div>`}
  </header>
`;

/** What the section holds. */
Section.Body = (...children) => html`<div class="section__body">${children}</div>`;

/**
 * A body laying its children out in a grid of cards.
 *
 * The commonest body by far, split out so that every list of cards does not
 * restate the same track definition.
 */
Section.Grid = (...children) => html`<div class="section__body section__body--grid">${children}</div>`;

/** A body laying its children out in a column. */
Section.Stack = (...children) => html`<div class="section__body section__body--stack">${children}</div>`;
