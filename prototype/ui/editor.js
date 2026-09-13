// The editor: something being worked on, with a panel of its properties beside it.
//
// The shape appears wherever a thing is both made and configured. A post has a
// text and a publication status, the landing page has a list of blocks and the
// settings of the open one. Before this each was its own grid with its own
// column width, which is two copies of one layout that would have drifted apart
// at the first change to either.
//
// The panel is a Card, because that is what it is. What this compound adds is
// the arrangement: a wide side that scrolls with the page, a narrow side that
// stays in view whilst you work, and a toolbar above a writing surface where
// there is one.
//
// In the real project:
//
//   <Editor>
//     <Editor.Main>
//       <Editor.Toolbar>…</Editor.Toolbar>
//       <Editor.Surface>…</Editor.Surface>
//       <Editor.Actions destructive={…}>…</Editor.Actions>
//     </Editor.Main>
//     <Editor.Panel title="…" note="…">…</Editor.Panel>
//   </Editor>

import { attrs, html } from "../shared/markup.js";
import { Card } from "./card.js";

/**
 * The editor.
 *
 * @param attributes Extra attributes as an object, for the data the caller needs
 *                   on it, such as which entry is open.
 * @param parts      A main side and a panel, in that order.
 */
export const Editor = (attributes = {}, ...parts) =>
  html`<section class="editor" ${attrs(attributes)}>${parts}</section>`;

/** The wide side: the thing being worked on. */
Editor.Main = (...children) => html`<div class="editor__main">${children}</div>`;

/**
 * The row of tools above the writing surface.
 *
 * @param groups Arrays of tools. A divider is drawn between groups, so the
 *               caller groups by meaning rather than placing separators by hand.
 */
Editor.Toolbar = (...groups) => html`
  <div class="editor__toolbar">
    ${groups.map(
      (group, index) => html`${index > 0 && html`<span class="editor__divider"></span>`}${group}`,
    )}
  </div>
`;

/**
 * A tool in the toolbar.
 *
 * With an icon the label is what a screen reader announces and what appears on
 * hover. Without one the label is the lettering of the tool itself, and the tool
 * widens to hold it.
 *
 * @param label What the tool does.
 * @param icon  The icon's class, family and name together, because which family
 *              a project uses is decided by the project and not by this package.
 */
Editor.Tool = ({ label, icon } = {}) => html`
  <button
    class="editor__tool ${icon ? "" : "editor__tool--text"}"
    type="button"
    ${attrs({ "aria-label": icon ? label : false, title: icon ? label : false })}
  >
    ${icon ? html`<i class="${icon}" aria-hidden="true"></i>` : label}
  </button>
`;

/** The writing surface. */
Editor.Surface = (...children) => html`<div class="editor__surface">${children}</div>`;

/**
 * The actions under the writing surface.
 *
 * They belong to the text rather than to the properties beside it, which is why
 * they are here and not in the panel's footer.
 *
 * @param destructive An action pushed to the far left, away from the others, so
 *                    nobody reaches it whilst aiming for the primary one.
 * @param actions     The rest, in order of weight with the primary one last.
 */
Editor.Actions = ({ destructive, actions } = {}) => html`
  <div class="actions">
    ${destructive && html`<span class="actions__aside">${destructive}</span>`}
    ${actions}
  </div>
`;

/**
 * The properties beside the thing being worked on.
 *
 * A Card, so it announces itself and closes itself the way every other card in
 * the product does. It stays in view whilst the main side scrolls, because the
 * properties are what you reach for whilst working rather than after it.
 *
 * @param eyebrow Rubric above the title.
 * @param title   What the panel is for.
 * @param note    A hint about the panel as a whole, in its footer.
 * @param actions Buttons belonging to the panel as a whole, in its footer.
 * @param fields  The properties themselves, one Field each.
 */
Editor.Panel = ({ eyebrow, title, note, actions } = {}, ...fields) => html`
  <div class="editor__panel">
    ${Card(
      Card.Header({ eyebrow, title }),
      Card.Stack(fields),
      (note || actions) && Card.Footer({ note, actions }),
    )}
  </div>
`;
