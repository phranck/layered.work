import {
  addressPrefix,
  type ContentLanguage,
  MaxLength,
  SLUG_PATTERN,
  slugFromTitle,
} from "@layered/schemas";

/**
 * The address of an entry in the editor panel: the part that follows from what
 * the entry is, shown and fixed, and its last segment, which the author edits.
 *
 * What is typed is written into the shape a slug has as it is typed, so a
 * title pasted in becomes a slug at once. A hyphen at the end is kept whilst
 * typing, because the next word is about to follow it, and dropped when the
 * field is left. Leaving the field empty takes the slug the title gives.
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

/**
 * @param inputId - The id the field's label points at.
 * @param path - The address the entry answers at now, or null.
 * @param language - The entry's language.
 * @param title - The entry's title, for an emptied field.
 * @param value - The slug the draft holds.
 * @param onChange - Replaces it.
 */
export function AddressField({
  inputId,
  path,
  language,
  title,
  value,
  onChange,
}: {
  inputId: string;
  path: string | null;
  language: ContentLanguage;
  title: string;
  value: string;
  onChange: (slug: string) => void;
}) {
  return (
    <span className="address-field">
      <span className="address-field__fixed" aria-hidden="true">
        {addressPrefix(path, language)}
      </span>
      <input
        id={inputId}
        className="input"
        value={value}
        maxLength={MaxLength.Handle}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        aria-invalid={isSavableSlug(value) ? undefined : true}
        onChange={(event) => onChange(typedSlug(event.target.value))}
        onBlur={(event) => onChange(finishedSlug(event.target.value, title))}
      />
    </span>
  );
}
