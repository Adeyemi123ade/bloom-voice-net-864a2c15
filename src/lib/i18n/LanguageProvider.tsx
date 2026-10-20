import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import type { LanguageCode } from "./strings";
import {
  initialLanguage,
  isLanguageReady,
  isTextKey,
  languageDir,
  loadLanguage,
  saveLanguage,
  translate,
} from "./language";
import { LanguageContext, type LanguageState } from "./context";

/** The language chosen on this phone, for the whole app. */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLang] = useState<LanguageCode>(initialLanguage);
  // A downloadable language not here yet: wait for it (a moment, from the
  // phone's cache after the first time) rather than flash English.
  const [ready, setReady] = useState(() => isLanguageReady(language));

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = languageDir(language);
    if (isLanguageReady(language)) {
      setReady(true);
      return;
    }
    let cancelled = false;
    void loadLanguage(language).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [language]);

  const setLanguage = useCallback((code: LanguageCode) => {
    saveLanguage(code);
    // Switch once the text is here, so the screen changes in one go.
    void loadLanguage(code).then(() => setLang(code));
  }, []);

  const value = useMemo<LanguageState>(
    () => ({
      language,
      setLanguage,
      t: (key, vars) => translate(language, key, vars),
      tx: (s) => (isTextKey(s) ? translate(language, s) : s),
    }),
    [language, setLanguage],
  );
  if (!ready) return null;
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
