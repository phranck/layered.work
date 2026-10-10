import type { InterfaceLanguage } from "@layered/schemas";
import { createContext, type ReactNode, use, useEffect } from "react";
import {
  browserLanguage,
  type DashboardStringArgs,
  type DashboardStringKey,
  dashboardText,
} from "./dashboard-i18n.js";

const LanguageContext = createContext<InterfaceLanguage | null>(null);

/**
 * Puts one interface language in force for everything inside it, and marks the
 * document with it so the browser hyphenates and reads it aloud correctly.
 *
 * @param language - The account's interface language, or the browser's before
 *   anybody has signed in.
 */
export function DashboardLanguageProvider({
  children,
  language,
}: {
  children: ReactNode;
  language: InterfaceLanguage;
}) {
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  return <LanguageContext value={language}>{children}</LanguageContext>;
}

/**
 * The interface language in force, and the lookup that speaks it.
 *
 * Outside a provider, which is where an error screen can end up when the
 * account failed to load, the browser's language stands in.
 */
export function useDashboardLanguage() {
  const language = use(LanguageContext) ?? browserLanguage();
  return {
    language,
    text: <Key extends DashboardStringKey>(key: Key, ...args: DashboardStringArgs<Key>) =>
      dashboardText(language, key, ...args),
  };
}
