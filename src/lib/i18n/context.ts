import { createContext, useContext } from "react";
import type { LanguageCode, TextKey } from "./strings";
import { isTextKey, translate } from "./language";

export type LanguageState = {
  language: LanguageCode;
  setLanguage: (code: LanguageCode) => void;
  t: (key: TextKey, vars?: Record<string, string | number>) => string;
  /** A key is translated; any other text (e.g. a server message) is shown as is. */
  tx: (keyOrText: string) => string;
};

export const LanguageContext = createContext<LanguageState>({
  language: "en",
  setLanguage: () => {},
  t: (key, vars) => translate("en", key, vars),
  tx: (s) => (isTextKey(s) ? translate("en", s) : s),
});

/** The chosen language and `t(key)` for its text. */
export const useLanguage = () => useContext(LanguageContext);
