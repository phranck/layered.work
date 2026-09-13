// The sidebar.
//
// Its own compound rather than markup inside the dashboard view, because it is a
// place with a fixed shape: a mark at the top, navigable sections in the middle,
// the signed-in user at the foot. What fills those parts changes; the parts do
// not.
//
// The sections inside it are the shared Section compound, not a sidebar-specific
// one. A heading with a list under it is the same thing here as on a page, and
// only the token scope makes it look like a sidebar.
//
// In the real project:
//
//   <Sidebar>
//     <Sidebar.Header><Logo /></Sidebar.Header>
//     <Sidebar.Body>{sections}</Sidebar.Body>
//     <Sidebar.Footer>{user}</Sidebar.Footer>
//   </Sidebar>

import { html } from "../shared/markup.js";

/**
 * The sidebar.
 *
 * @param parts A header, a body and a footer, in that order. All optional,
 *              though a sidebar with no body has nothing to navigate.
 */
export const Sidebar = (...parts) => html`<aside class="sidebar">${parts}</aside>`;

/**
 * The top of the sidebar, where the mark sits.
 *
 * Centred rather than aligned with the entries below, because it is the sign
 * above the column rather than the first item in it.
 */
Sidebar.Header = (...children) => html`<div class="sidebar__header">${children}</div>`;

/**
 * The navigable middle.
 *
 * It scrolls when it has to, so that the header and the footer stay put on a
 * short window. That is why the sidebar is a column with three parts rather than
 * one long list with something pinned to its end.
 */
Sidebar.Body = (...children) => html`<div class="sidebar__body">${children}</div>`;

/**
 * The foot of the sidebar.
 *
 * Held down by the body taking the remaining height, so it sits at the bottom of
 * a short sidebar and still scrolls into view on a long one.
 */
Sidebar.Footer = (...children) => html`<div class="sidebar__footer">${children}</div>`;

/**
 * The handle that resizes the sidebar.
 *
 * Part of the sidebar rather than of whatever holds it: the sidebar owns its
 * width, so it owns the control that changes it.
 *
 * @param label What a screen reader announces for it.
 */
Sidebar.Handle = ({ label } = {}) => html`
  <div class="sidebar__handle" data-resize-handle role="separator" aria-orientation="vertical" aria-label="${label}"></div>
`;
