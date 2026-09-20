import { createContext, type ReactNode, use, useEffect } from "react";
import { type DashboardStringKey, dashboardText, type InterfaceLanguage } from "./dashboard-i18n.js";

const LanguageContext = createContext<InterfaceLanguage>("de");

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

export function useDashboardLanguage() {
  const language = use(LanguageContext);
  return { language, text: (key: DashboardStringKey) => dashboardText(language, key) };
}
