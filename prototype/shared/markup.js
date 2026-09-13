// Markup construction for the prototypes.
//
// Every value interpolated into a template is escaped by the tag itself, so a
// forgotten escape call is not possible. Anything already built as markup has to
// be marked with `raw`, which makes the one dangerous case visible at the call
// site instead of hiding it behind a plain string.

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Marks an already built markup string so the tag lets it through unescaped. */
class Raw {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

/**
 * Marks a string as markup that must not be escaped again.
 *
 * Only ever called with markup this code produced itself, never with content.
 */
export const raw = (value) => new Raw(value);

const escapeText = (value) => String(value).replace(/[&<>"']/g, (character) => ESCAPES[character]);

const serialise = (value) => {
  if (value === null || value === undefined || value === false) return "";
  if (value instanceof Raw) return value.value;
  if (Array.isArray(value)) return value.map(serialise).join("");
  return escapeText(value);
};

/**
 * Builds a markup string with every interpolated value escaped.
 *
 * @returns A `Raw`, so templates nest without being escaped a second time.
 */
export const html = (strings, ...values) =>
  raw(strings.reduce((out, chunk, index) => out + chunk + serialise(values[index]), ""));

/**
 * Replaces an element's children with the given markup.
 *
 * Uses a document fragment rather than assigning markup to the element, so the
 * parse happens once and detached from the live tree.
 */
export function render(target, markup) {
  const fragment = document.createRange().createContextualFragment(String(markup));
  target.replaceChildren(fragment);
}

/** Appends markup to an element without disturbing what is already there. */
export function append(target, markup) {
  target.append(document.createRange().createContextualFragment(String(markup)));
}

/**
 * Builds an attribute list from an object.
 *
 * Attributes cannot be passed through the tag as a string: the tag escapes what
 * it interpolates, so the quotes around a value become characters in the value
 * rather than syntax around it. Passing an object and building the string here
 * keeps the escaping where it belongs, on the values alone.
 *
 * A value of `true` renders the bare attribute, `false`, `null` and `undefined`
 * render nothing.
 */
export const attrs = (attributes = {}) =>
  raw(
    Object.entries(attributes)
      .filter(([, value]) => value !== false && value !== null && value !== undefined)
      .map(([name, value]) => (value === true ? name : `${name}="${escapeText(value)}"`))
      .join(" "),
  );

/** Renders a list through a template and concatenates the result. */
export const each = (items, template) => raw(items.map((item, index) => String(template(item, index))).join(""));
