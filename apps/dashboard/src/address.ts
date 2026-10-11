import { SLUG_PATTERN, slugFromTitle } from "@layered/schemas";

/**
 * How the last segment of an entry's address is typed.
 *
 * What is typed is written into the shape a slug has as it is typed, so a title
 * pasted in becomes a slug at once. A hyphen at the end is kept while typing,
 * because the next word is about to follow it, and dropped when the field is
 * left. Leaving the field empty takes the slug the title gives. The editor
 * saves nothing while a slug is still unfinished, by any of the ways a save
 * starts.
 */

/**
 * What the field holds after a keystroke.
 *
 * @param typed - The field's raw value.
 */
export function typedSlug(typed: string): string {
  if (typed.trim() === "") return "";
  const slug = slugFromTitle(typed);
  return /[^a-z0-9]$/i.test(typed) && slug !== "entry" ? `${slug}-` : slug;
}

/**
 * What the field holds once it is left.
 *
 * @param typed - The field's value.
 * @param title - The entry's title, which an empty field takes its slug from.
 */
export function finishedSlug(typed: string, title: string): string {
  return slugFromTitle(typed.trim() === "" ? title : typed);
}

/** Whether a slug can be saved as it stands. */
export function isSavableSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}
