import type { ContentProfile } from "@layered/content";
import { type BilingualText, CONTENT_LANGUAGES, type ContentLanguage } from "@layered/schemas";
import { Field, Input, Segmented } from "@layered/ui";
import type { ReactNode } from "react";
import type { KnownValue } from "./content-completion.js";
import { useDashboardLanguage } from "./language-context.js";
import { MarkdownField } from "./markdown-field.js";
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
  label: string;
  hint?: ReactNode;
  value: BilingualText;
  onChange: (value: BilingualText) => void;
  /** What the field shows while empty, in each language. */
  placeholder?: Partial<BilingualText>;
  /**
   * The part of the content language a text longer than a line is written in,
   * which puts it in the Markdown editor. Without one the text is one line.
   */
  profile?: ContentProfile;
  /** What completes after `{{` in the Markdown editor, where the profile holds references. */
  values?: readonly KnownValue[];
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
  profile,
  values,
  maxLength,
  disabled,
}: TranslatedFieldProps) {
  const language = useTextLanguage();
  const shared = {
    id: `${id}-${language}`,
    lang: language,
    placeholder: placeholder?.[language],
    maxLength,
    disabled,
  };
  if (profile) {
    return (
      <MarkdownField
        {...shared}
        label={label}
        hint={hint}
        value={value[language]}
        profile={profile}
        values={values}
        onChange={(text) => onChange({ ...value, [language]: text })}
      />
    );
  }
  return (
    <Field label={label} hint={hint} htmlFor={shared.id}>
      <Input
        {...shared}
        value={value[language]}
        onChange={(event) => onChange({ ...value, [language]: event.target.value })}
      />
    </Field>
  );
}

/** Bilingual texts, one language at a time, under one switch. */
export const Translated = Object.assign(TextLanguageScope, {
  Switch: TranslatedSwitch,
  Field: TranslatedField,
});
