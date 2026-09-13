// How wide the text of an entry runs.
//
// A property of the entry rather than of the site: one post is prose and wants a
// reading measure, the next is full of tables and wants the room. Deciding that
// once for everything would be deciding it wrongly for half of them.
//
// In the real project this is a column on the entry and travels with it. Here it
// is kept per entry id in local storage, so the prototype can show the effect
// immediately, which is the point of having it in a prototype at all.

/**
 * The widths on offer.
 *
 * A line of text gets harder to read as it lengthens, because the eye loses the
 * start of the next line on the way back. The usual recommendation is 45 to 75
 * characters; measured on this design's body size, 68ch renders as about 82, so
 * `normal` sits at the top of that range and the others step either side.
 *
 * `full` is deliberately available. A page of tables or wide code wants the room
 * more than it wants the measure.
 *
 * The labels are sizes rather than words. Four words do not fit side by side in
 * the control that offers them, and a size needs no translation.
 */
export const READING_WIDTHS = [
  { id: "narrow", value: "56ch", label: "S", characters: 68 },
  { id: "normal", value: "68ch", label: "M", characters: 82 },
  { id: "wide", value: "82ch", label: "L", characters: 99 },
  { id: "full", value: "100%", label: "XL", characters: null },
];

/** What an entry gets when nobody has chosen for it. */
export const DEFAULT_READING_WIDTH = "normal";

const STORAGE_KEY = "layered.entryReadingWidth";

/** The stored choices, by entry id. */
const stored = (() => {
  try {
    return new Map(Object.entries(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")));
  } catch {
    return new Map();
  }
})();

/** The width chosen for an entry, or the default where none was. */
export const readingWidthOf = (entryId) => stored.get(String(entryId)) ?? DEFAULT_READING_WIDTH;

/** Records a choice for one entry. */
export function setReadingWidthOf(entryId, widthId) {
  if (!READING_WIDTHS.some((width) => width.id === widthId)) return;
  stored.set(String(entryId), widthId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(stored)));
}

/**
 * Puts an entry's width in force for the page about to render it.
 *
 * Writes the one token every measured element reads, so the article follows
 * without anything else being told. Called per page rather than once at start-up,
 * because the value belongs to whatever is being shown.
 */
export function applyReadingWidth(entryId) {
  const chosen = READING_WIDTHS.find((width) => width.id === readingWidthOf(entryId));
  document.documentElement.style.setProperty("--reading-measure", chosen.value);
}
