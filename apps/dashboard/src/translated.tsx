import { type BilingualText, CONTENT_LANGUAGES, type ContentLanguage } from "@layered/schemas";
import { Field, Input, Segmented, Textarea } from "@layered/ui";
import type { ReactNode } from "react";
import { useDashboardLanguage } from "./language-context.js";
import { TextLanguageScope, useTextLanguage, useTextLanguageChoice } from "./text-language.js";

/**
 * Texts the site holds in both its languages, edited one language at a time.
 *
 * A card or a dialog wraps its content in `Translated`, puts
 * `Translated.Switch` in its header, and draws each text as a
 * `Translated.Field`, which shows the field of the chosen language only. What
 * was typed in the other language stays in the draft the field writes to, so
 * switching back shows it unchanged. Which language is chosen is the business
 * of `text-language.tsx`; this file only draws.
 */

/**
 * The site's languages as a segmented control offers them, by their codes.
 *
 * Shared by the switch and by every other control that picks one of the two,
 * such as the site's default language, so they read alike.
 *
 * @param disabled - Whether the options can be chosen.
 */
export function contentLanguageOptions(disabled = false) {
  return CONTENT_LANGUAGES.map((language) => ({ value: language, label: language.toUpperCase(), disabled }));
}

/** The two languages side by side, for the header of the card it changes. */
function TranslatedSwitch() {
  const { language, choose } = useTextLanguageChoice();
  const { text } = useDashboardLanguage();
  return (
    <Segmented
      aria-label={text("textLanguage")}
      value={language}
      options={contentLanguageOptions()}
      onValueChange={(value) => choose(value as ContentLanguage)}
    />
  );
}

/** Props for one bilingual text. */
interface TranslatedFieldProps {
  /** The field's id, which the chosen language is added to. */
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  value: BilingualText;
  onChange: (value: BilingualText) => void;
  /** What the field shows while empty, in each language. */
  placeholder?: Partial<BilingualText>;
  /** A text area rather than one line. */
  multiline?: boolean;
  /** Rows of a text area, where it should open taller than its default. */
  rows?: number;
  maxLength?: number;
  disabled?: boolean;
}

/** One bilingual text, showing the field of the chosen language and keeping the other. */
function TranslatedField({
  id,
  label,
  hint,
  value,
  onChange,
  placeholder,
  multiline = false,
  rows,
  maxLength,
  disabled,
}: TranslatedFieldProps) {
  const language = useTextLanguage();
  const shared = {
    id: `${id}-${language}`,
    lang: language,
    value: value[language],
    placeholder: placeholder?.[language],
    maxLength,
    disabled,
  };
  return (
    <Field label={label} hint={hint} htmlFor={shared.id}>
      {multiline ? (
        <Textarea
          {...shared}
          rows={rows}
          onChange={(event) => onChange({ ...value, [language]: event.target.value })}
        />
      ) : (
        <Input {...shared} onChange={(event) => onChange({ ...value, [language]: event.target.value })} />
      )}
    </Field>
  );
}

/** Bilingual texts, one language at a time, under one switch. */
export const Translated = Object.assign(TextLanguageScope, {
  Switch: TranslatedSwitch,
  Field: TranslatedField,
});
