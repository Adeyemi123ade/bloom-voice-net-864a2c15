import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import type { LanguageCode } from "./strings";
import { initialLanguage, saveLanguage, translate } from "./language";
import { LanguageContext, type LanguageState } from "./context";

/** The language chosen on this phone, for the whole app. */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLang] = useState<LanguageCode>(initialLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((code: LanguageCode) => {
    saveLanguage(code);
    setLang(code);
  }, []);

  const value = useMemo<LanguageState>(
    () => ({ language, setLanguage, t: (key, vars) => translate(language, key, vars) }),
    [language, setLanguage],
  );
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
