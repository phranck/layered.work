/**
 * The last segment of an address: an entry's or a topic's slug.
 *
 * Shared by the API, which refuses anything else, and the dashboard, which
 * writes a typed segment into this shape before it is sent, so the two agree on
 * what a slug is without either stating it a second time.
 */

/** Lower-case letters and digits in runs, joined by single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** How long a slug written from a title may grow before it is cut. */
const SLUG_MAX_LENGTH = 80;

/**
 * The German letters a slug spells out rather than strips, because "Lötkolben"
 * reads as "loetkolben" to a German reader and as nothing at all as "lotkolben".
 */
const GERMAN_TRANSCRIPTIONS: Readonly<Record<string, string>> = { ä: "ae", ö: "oe", ü: "ue", ß: "ss" };

/**
 * A slug written from any text: lower case, German letters spelt out, other
 * accents taken off, and every run of anything else turned into one hyphen.
 *
 * @param title - The text to write it from, such as a title or what was typed.
 * @returns A segment matching `SLUG_PATTERN`, or `entry` where nothing is left.
 */
export function slugFromTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[äöüß]/g, (letter) => GERMAN_TRANSCRIPTIONS[letter] ?? letter)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/, "");
  return slug || "entry";
}
