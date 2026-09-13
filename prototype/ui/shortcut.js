// A keyboard shortcut, drawn as the key cap it names.
//
// It appears wherever a control can also be reached from the keyboard, which in
// this product is every search field. One component rather than a `kbd` styled
// in each place, so the cap is the same size and the same shape on the site and
// in the workbench, and a reader who has learnt it once recognises it.
//
// In the real project:
//
//   <Shortcut key="K" />

import { html } from "../shared/markup.js";

/**
 * Whether the visitor is on a keyboard with a command key.
 *
 * Decides only which modifier the cap shows. Both combinations work everywhere,
 * so a wrong guess costs a label rather than a function.
 */
const isApplePlatform = () => /Mac|iPhone|iPad/.test(navigator.platform ?? navigator.userAgent);

/**
 * A shortcut with the platform's own modifier.
 *
 * @param key The key pressed together with the modifier, as a capital letter.
 */
export const Shortcut = ({ key } = {}) => html`
  <kbd class="shortcut">${isApplePlatform() ? `⌘${key}` : `Strg ${key}`}</kbd>
`;
