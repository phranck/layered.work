// A list of options, each with a mark, a name and a line saying what it means.
//
// The segmented control is for a choice whose options are one word each. This is
// for a choice where each option needs explaining, which is most of the ones
// worth making: publication status, visibility, a plan, a role.
//
// Each option can carry a tone, and the tone does two jobs at once: it colours
// the mark, and the chosen option takes a dimmed version of that same colour as
// its fill. That is what makes the choice readable without reading: the green
// option is green when it is chosen, and the reader learns the mapping once.
//
// In the real project:
//
//   <Choice name="status" value={status}>
//     <Choice.Option value="public" label="…" note="…" tone="success" />
//     …
//   </Choice>

import { attrs, html } from "../shared/markup.js";

/**
 * A list of explained options.
 *
 * @param options `{ value, label, note, tone }` for each. `tone` names a status
 *                token: success, warning, info or accent.
 * @param value   The one currently chosen.
 * @param name    A data attribute the caller uses to find this control again.
 */
export const Choice = ({ options = [], value, name } = {}) => html`
  <div class="choice" ${attrs(name ? { [`data-${name}`]: true } : {})} role="radiogroup">
    ${options.map(
      (option) => html`
        <button
          class="choice__option"
          type="button"
          role="radio"
          ${attrs({
            "data-value": option.value,
            "data-tone": option.tone,
            "aria-checked": String(option.value === value),
          })}
        >
          <span class="choice__mark" aria-hidden="true"></span>
          <span class="choice__text">
            <span class="choice__label">${option.label}</span>
            ${option.note && html`<span class="choice__note">${option.note}</span>`}
          </span>
        </button>
      `,
    )}
  </div>
`;

/**
 * Selects an option, in place.
 *
 * In place rather than by re-rendering, because a control replaced on every
 * change cannot animate: the new element has no previous state to move from.
 *
 * @returns The value now chosen, or null if the element was not an option.
 */
export function selectChoice(button) {
  const group = button?.closest(".choice");
  if (!group) return null;
  const options = [...group.querySelectorAll(".choice__option")];
  if (!options.includes(button)) return null;
  for (const option of options) option.setAttribute("aria-checked", String(option === button));
  return button.dataset.value;
}
