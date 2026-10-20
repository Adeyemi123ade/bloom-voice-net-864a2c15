import { createContext, useContext } from "react";
import type { LanguageCode, TextKey } from "./strings";
import { translate } from "./language";

export type LanguageState = {
  language: LanguageCode;
  setLanguage: (code: LanguageCode) => void;
  t: (key: TextKey, vars?: Record<string, string | number>) => string;
};

export const LanguageContext = createContext<LanguageState>({
  language: "en",
  setLanguage: () => {},
  t: (key, vars) => translate("en", key, vars),
});

/** The chosen language and `t(key)` for its text. */
export const useLanguage = () => useContext(LanguageContext);
