import { CONTENT_LOCALES, INTERFACE_LANGUAGES, type InterfaceLanguage } from "@layered/schemas";

/**
 * How the dashboard writes dates, times, sizes and lists, in the interface
 * language.
 *
 * Every formatter is made once per language when this module loads and handed
 * out from then on, because making one is what costs: a table that built its
 * own for every row would build one per row and render. The interface speaks
 * the site's two languages, so each formats in the locale the site uses for
 * the same language.
 */

/**
 * One formatter for each interface language, made by `make` in that language's
 * locale.
 *
 * @param make - Builds the formatter for one locale.
 * @returns The formatters, by interface language.
 */
function perLanguage<Formatter>(make: (locale: string) => Formatter): Record<InterfaceLanguage, Formatter> {
  return Object.fromEntries(
    INTERFACE_LANGUAGES.map((language) => [language, make(CONTENT_LOCALES[language])]),
  ) as Record<InterfaceLanguage, Formatter>;
}

/** A day, as a list's date column shows it. */
export const DATE_FORMAT = perLanguage((locale) => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }));

/** A day and the time of day, for the moment something arrived. */
export const DATE_TIME_FORMAT = perLanguage(
  (locale) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }),
);

/** The time of day, for when something happened today, such as a save. */
export const TIME_FORMAT = perLanguage((locale) => new Intl.DateTimeFormat(locale, { timeStyle: "short" }));

/** A file's size in kilobytes, with one decimal at most. */
export const KILOBYTE_FORMAT = perLanguage(
  (locale) => new Intl.NumberFormat(locale, { style: "unit", unit: "kilobyte", maximumFractionDigits: 1 }),
);

/** A list of names joined into one phrase, with the language's word for "and" before the last. */
export const LIST_FORMAT = perLanguage((locale) => new Intl.ListFormat(locale, { type: "conjunction" }));
