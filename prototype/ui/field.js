// A form field: a label, a control, and a hint under it.
//
// Written out by hand in a dozen places before, which is how the account panel
// ended up with hints the block settings did not have and the editor labelled
// some controls and not others.
//
// The control is passed in rather than chosen by a `type` prop, because a field
// holding a text input, a switch, a segmented control and a row of chips is the
// same field. A `type` would grow one branch per control and the field would end
// up knowing about every control in the product.
//
// In the real project:
//
//   <Field label="…" hint="…" htmlFor="name">
//     <Input id="name" … />
//   </Field>

import { attrs, html } from "../shared/markup.js";

/**
 * A field.
 *
 * @param label   The name of the setting.
 * @param hint    What the reader needs to know that the label does not say.
 * @param htmlFor The id of the control, where there is a real one to point at.
 * @param control The control itself.
 */
export const Field = ({ label, hint, htmlFor, control } = {}) => html`
  <div class="field">
    ${label &&
    (htmlFor
      ? html`<label class="field__label" for="${htmlFor}">${label}</label>`
      : html`<span class="field__label">${label}</span>`)}
    ${control}
    ${hint && html`<span class="field__hint">${hint}</span>`}
  </div>
`;

/**
 * A field whose label and control sit on one line.
 *
 * For a switch, where the label and the thing it switches read as one sentence
 * and a label stacked above a toggle wastes a line saying so.
 */
Field.Inline = ({ label, control } = {}) => html`
  <div class="field field--inline">
    <span class="field__label">${label}</span>
    ${control}
  </div>
`;

/**
 * A text input.
 *
 * The attributes go through `attrs`, because the tag escapes what it
 * interpolates and a quoted attribute built as a string arrives with its quotes
 * turned into characters.
 */
export const Input = ({ id, value = "", type = "text", placeholder } = {}) => html`
  <input class="input" ${attrs({ id, type, value, placeholder })} />
`;

/**
 * A switch.
 *
 * @param on    Whether it is on.
 * @param label What a screen reader announces, where no visible label points at
 *              it.
 */
export const Switch = ({ on = false, label } = {}) => html`
  <span
    class="switch"
    role="switch"
    ${attrs({ "data-on": on, "aria-checked": String(on), "aria-label": label })}
  ></span>
`;

/**
 * A dropdown.
 *
 * For a choice between named options whose names are longer than a word. The
 * segmented control shows every option at once and pays for that in width, so
 * it holds one short word per option and no more. The moment a name has to be
 * shortened to fit, the reader can no longer read what they are choosing, and
 * the choice belongs here instead.
 *
 * The native element, because the browser's own menu works with the keyboard,
 * the screen reader and the platform without any of that being built. The
 * wrapper exists only to draw the chevron, since a select takes no
 * pseudo-element.
 *
 * @param options `{ value, label }` for each choice.
 * @param value   The one currently chosen.
 * @param id      The id a label points at.
 * @param name    A data attribute the caller uses to find this control again.
 */
export const Select = ({ options = [], value, id, name } = {}) => html`
  <span class="select">
    <select class="input" ${attrs({ id, [`data-${name}`]: Boolean(name) })}>
      ${options.map(
        (option) => html`
          <option ${attrs({ value: option.value, selected: option.value === value })}>${option.label}</option>
        `,
      )}
    </select>
  </span>
`;

/**
 * A choice between a handful of named options, all of them visible.
 *
 * With three options a dropdown hides more than it saves, and the reader cannot
 * see what they are choosing between without opening it. That holds only whilst
 * every option is one short word: a name that has to be shortened to fit is a
 * name the reader cannot read, and such a choice takes a Select.
 *
 * @param options  `{ value, label }` for each choice.
 * @param value    The one currently chosen.
 * @param name     A data attribute the caller uses to find this control again.
 */
export const Segmented = ({ options = [], value, name } = {}) => {
  const chosen = Math.max(options.findIndex((option) => option.value === value), 0);
  return html`
    <div
      class="segmented"
      ${attrs({
        [`data-${name}`]: Boolean(name),
        style: `--segment-count: ${options.length}; --segment-index: ${chosen}`,
      })}
    >
      ${options.map(
        (option) => html`
          <button type="button" data-value="${option.value}" aria-pressed="${String(option.value === value)}">
            ${option.label}
          </button>
        `,
      )}
    </div>
  `;
};

/**
 * Moves the pill to another option, in place.
 *
 * In place rather than by re-rendering, because a control that is replaced on
 * every change cannot animate: the new element has no previous state to move
 * from. This is the shape any animated state change has to take, whatever
 * framework draws it.
 *
 * @returns The value now chosen, or null if the element was not an option.
 */
export function selectSegment(button) {
  const segmented = button?.closest(".segmented");
  if (!segmented) return null;
  const options = [...segmented.querySelectorAll("button")];
  const index = options.indexOf(button);
  if (index < 0) return null;

  segmented.style.setProperty("--segment-index", String(index));
  for (const option of options) option.setAttribute("aria-pressed", String(option === button));
  return button.dataset.value;
}
