import type { ContentLanguage } from "./entries.js";

/**
 * The last segment of an address: an entry's or a topic's slug.
 *
 * Shared by the API, which refuses anything else, and the dashboard, which
 * writes a typed segment into this shape before it is sent, so the two agree on
 * what a slug is without either stating it a second time.
 */

/** Lower-case letters and digits in runs, joined by single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** How long a slug written from a title or a file name may grow before it is cut. */
export const SLUG_MAX_LENGTH = 80;

/**
 * The German letters a slug spells out rather than strips, because "Lötkolben"
 * reads as "loetkolben" to a German reader and as nothing at all as "lotkolben".
 */
const GERMAN_TRANSCRIPTIONS: Readonly<Record<string, string>> = { ä: "ae", ö: "oe", ü: "ue", ß: "ss" };

/**
 * A slug written from any text: lower case, German letters spelt out, other
 * accents taken off, and every run of anything else turned into one hyphen.
 *
 * Every slug this project writes comes from here, an entry's, a topic's and a
 * library file's alike, so the same title gives the same slug wherever it is
 * written.
 *
 * @param title - The text to write it from, such as a title, a file name or what was typed.
 * @param fallback - What stands where nothing is left, a slug itself.
 * @returns A segment matching `SLUG_PATTERN`, or `fallback` where nothing is left.
 */
export function slugFromTitle(title: string, fallback = "entry"): string {
  const slug = title
    .toLowerCase()
    .replace(/[äöüß]/g, (letter) => GERMAN_TRANSCRIPTIONS[letter] ?? letter)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/, "");
  return slug || fallback;
}

/**
 * The slug tried in place of a taken one: the slug itself first, then numbered
 * from two, such as `bench`, `bench-2`, `bench-3`.
 *
 * Entries, topics and library files all number this way, so a second thing of
 * the same name reads the same wherever it is.
 *
 * @param slug - The slug wanted.
 * @param attempt - How many tries came before, zero for the first.
 */
export function numberedSlug(slug: string, attempt: number): string {
  return attempt === 0 ? slug : `${slug}-${attempt + 1}`;
}

/**
 * Everything of a translation's address before its last segment, which follows
 * from what the entry is: its language prefix, or the section a migrated
 * project sits in. A translation without an address gets one carrying its
 * language, `/en/…` or `/de/…`, as everything written after the migration does.
 *
 * The API builds the address it stores from this, and the editor shows it as the
 * fixed part in front of the slug, so the two always agree.
 *
 * @param current - Its current address, or null where it has none.
 * @param language - Its language.
 * @returns The prefix, starting and ending with a slash, such as `/de/`.
 */
export function addressPrefix(current: string | null, language: ContentLanguage): string {
  const parents = current ? current.split("/").filter(Boolean).slice(0, -1) : [language];
  return `/${parents.map((segment) => `${segment}/`).join("")}`;
}

/**
 * The address a translation answers at with its last segment replaced.
 *
 * @param current - Its current address, or null where it has none.
 * @param language - Its language.
 * @param slug - The new last segment.
 */
export function addressWithSlug(current: string | null, language: ContentLanguage, slug: string): string {
  return `${addressPrefix(current, language)}${slug}/`;
}
