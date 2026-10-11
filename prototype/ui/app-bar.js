// The bar across the top of a workbench's content, beside its sidebar.
//
// Three places and nothing else: the start for the way back and the screen's
// name, the center for what just happened, and the end for what the screen can
// do. The center stays centered whatever the two sides hold, because the
// columns either side of it share what is left equally.
//
// In the real project:
//
//   <AppBar>
//     <AppBar.Start>…</AppBar.Start>
//     <AppBar.Center>…</AppBar.Center>
//     <AppBar.End>…</AppBar.End>
//   </AppBar>

import { html } from "../shared/markup.js";

/**
 * The bar.
 *
 * @param parts A start, a center and an end, in that order.
 */
export const AppBar = (...parts) => html`<header class="app-bar">${parts}</header>`;

/** The start of the bar: the way back, and the name of where the reader is. */
AppBar.Start = (...children) => html`<div class="app-bar__start">${children}</div>`;

/** The center of the bar: what just happened. */
AppBar.Center = (...children) => html`<div class="app-bar__center">${children}</div>`;

/** The end of the bar: the screen's actions, the most important last. */
AppBar.End = (...children) => html`<div class="app-bar__end">${children}</div>`;
