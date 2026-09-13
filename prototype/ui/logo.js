// The wordmark, shared by the site and the dashboard.
//
// The same file, the same arithmetic, one component. It sits here rather than in
// the site's chrome because the dashboard needs it too, and a second copy would
// be a second place to get the sizing wrong.
//
// The sizing is the reason this is a component at all. The logo file carries
// empty margin above and below the mark, measured at 48.9% ink to 100% height,
// so asking for a 30px logo produces a 15px mark. The caller asks for the
// optical height it wants and the derivation does the rest.

import { html } from "../shared/markup.js";

/**
 * The wordmark.
 *
 * The original SVG, used unchanged. It is phranck's mark, not a shape to be
 * rebuilt from letters, so it is loaded as the file it is and only ever sized
 * from outside.
 *
 * @param href      Where it leads. The start page by default.
 * @param inkHeight How tall the mark itself should appear. Omit for the size the
 *                  token system sets.
 * @param label     What a screen reader announces.
 */
export const Logo = ({ href = "#/home", inkHeight, label = "LAYERED.work" } = {}) => html`
  <a class="logo" href="${href}" aria-label="${label}" ${inkHeight ? `style="--logo-ink-height: ${inkHeight}"` : ""}>
    <img class="logo__image" src="../assets/logo.svg" alt="${label}" />
  </a>
`;
