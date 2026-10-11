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

/**
 * A moment the API recorded, as the dashboard writes it everywhere: the day
 * alone, as a list's date column shows it, or the day and the time of day.
 *
 * @param language - The interface language.
 * @param at - The instant, as the API sends it.
 * @param show - Whether the time of day is written as well.
 */
export function formatInstant(
  language: InterfaceLanguage,
  at: string,
  show: "date" | "dateTime" = "date",
): string {
  return (show === "date" ? DATE_FORMAT : DATE_TIME_FORMAT)[language].format(new Date(at));
}

/** The time of day, for when something happened today, such as a save. */
export const TIME_FORMAT = perLanguage((locale) => new Intl.DateTimeFormat(locale, { timeStyle: "short" }));

/** A file's size in kilobytes, with one decimal at most. */
const KILOBYTE_FORMAT = perLanguage(
  (locale) => new Intl.NumberFormat(locale, { style: "unit", unit: "kilobyte", maximumFractionDigits: 1 }),
);

/** A file's size in megabytes, with one decimal at most. */
const MEGABYTE_FORMAT = perLanguage(
  (locale) => new Intl.NumberFormat(locale, { style: "unit", unit: "megabyte", maximumFractionDigits: 1 }),
);

/** How many bytes the dashboard counts as one kilobyte. */
const BYTES_PER_KILOBYTE = 1024;

/**
 * A file's size as the dashboard writes it everywhere: in kilobytes below a
 * megabyte and in megabytes from there, with one decimal at most.
 *
 * @param language - The interface language.
 * @param bytes - The size in bytes.
 */
export function fileSize(language: InterfaceLanguage, bytes: number): string {
  const kilobytes = bytes / BYTES_PER_KILOBYTE;
  return kilobytes < BYTES_PER_KILOBYTE
    ? KILOBYTE_FORMAT[language].format(kilobytes)
    : MEGABYTE_FORMAT[language].format(kilobytes / BYTES_PER_KILOBYTE);
}

/** A list of names joined into one phrase, with the language's word for "and" before the last. */
export const LIST_FORMAT = perLanguage((locale) => new Intl.ListFormat(locale, { type: "conjunction" }));
