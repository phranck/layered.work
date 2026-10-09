import type { ContentLanguage } from "@layered/schemas";
import { createContext, type ReactNode, useContext, useState } from "react";
import { useDashboardLanguage } from "./language-context.js";

/**
 * Which of the site's two languages a card or a dialog shows its texts in.
 *
 * State only, and nothing drawn: the switch that changes it and the fields that
 * read it are in `translated.tsx`. Every control inside one scope shares the
 * language, so one switch changes a whole card at once. The scope starts on
 * the interface language, because that is the language the author is reading.
 */

/** The chosen language of one scope, and the way to change it. */
export interface TextLanguageChoice {
  language: ContentLanguage;
  choose: (language: ContentLanguage) => void;
}

const TextLanguageContext = createContext<TextLanguageChoice | null>(null);

/**
 * One scope's chosen language, for everything inside it.
 *
 * @param children - The card's or dialog's content, switch and fields included.
 */
export function TextLanguageScope({ children }: { children: ReactNode }) {
  const { language: interfaceLanguage } = useDashboardLanguage();
  const [language, choose] = useState<ContentLanguage>(interfaceLanguage);
  return <TextLanguageContext.Provider value={{ language, choose }}>{children}</TextLanguageContext.Provider>;
}

/**
 * The surrounding scope's language and the way to change it.
 *
 * @throws When used outside `TextLanguageScope`, which is a mistake in the
 *   screen rather than anything a reader did.
 */
export function useTextLanguageChoice(): TextLanguageChoice {
  const choice = useContext(TextLanguageContext);
  if (!choice) throw new Error("A bilingual text needs a TextLanguageScope around it.");
  return choice;
}

/** The language the surrounding scope shows its texts in. */
export function useTextLanguage(): ContentLanguage {
  return useTextLanguageChoice().language;
}
