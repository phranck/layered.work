import { addressPrefix, type ContentLanguage, MaxLength } from "@layered/schemas";
import { finishedSlug, isSavableSlug, typedSlug } from "./address.js";

/**
 * The address of an entry in the editor panel: the part that follows from what
 * the entry is, shown and fixed, and its last segment, which the author edits
 * by the rules in `address.ts`.
 *
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
