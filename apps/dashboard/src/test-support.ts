import { type ContentLanguage, INTERFACE_LANGUAGES } from "@layered/schemas";
import { fireEvent, within } from "@testing-library/react";
import { dashboardText } from "./dashboard-i18n.js";
import { contentLanguageOptions } from "./translated.js";

/**
 * Helpers the dashboard's tests share. Nothing here ships: only test files
 * import it.
 */

/** What the language switch of a card is called, in every interface language. */
const SWITCH_NAMES = new Set<string>(
  INTERFACE_LANGUAGES.map((interfaceLanguage) => dashboardText(interfaceLanguage, "textLanguage")),
);

/**
 * Chooses the language a card's bilingual texts show in, as a click on its
 * switch does.
 *
 * The switch is found by its name rather than by its buttons' labels, so a
 * language filter elsewhere on the screen, which also reads EN and DE, is never
 * the one clicked.
 *
 * @param language - The language the texts are to show in.
 * @param scope - The card or dialog whose switch it is, where the screen holds
 *   more than one. Defaults to the whole document.
 */
export function chooseTextLanguage(language: ContentLanguage, scope: HTMLElement = document.body) {
  const control = within(scope).getByRole("group", { name: (name) => SWITCH_NAMES.has(name) });
  const label = contentLanguageOptions().find((option) => option.value === language)?.label;
  fireEvent.click(within(control).getByRole("button", { name: String(label) }));
}
