import { DICTIONARIES, en, LANGUAGES, type LanguageCode, type TextKey } from "./strings";

const KEY = "chichat:language";

export function isLanguage(code: unknown): code is LanguageCode {
  return LANGUAGES.some((l) => l.code === code);
}

/** The saved choice, else the phone's own language if ChiChat has it, else English. */
export function initialLanguage(): LanguageCode {
  try {
    const saved = localStorage.getItem(KEY);
    if (isLanguage(saved)) return saved;
  } catch { /* storage unavailable */ }
  try {
    for (const tag of navigator.languages ?? [navigator.language]) {
      const base = String(tag).toLowerCase().split("-")[0];
      if (isLanguage(base)) return base;
    }
  } catch { /* ignore */ }
  return "en";
}

/** True when `s` is a key of a translated line (error messages are stored as keys). */
export function isTextKey(s: unknown): s is TextKey {
  return typeof s === "string" && Object.prototype.hasOwnProperty.call(en, s);
}

export function saveLanguage(code: LanguageCode): void {
  try { localStorage.setItem(KEY, code); } catch { /* ignore */ }
}

/** Text for `key` in `lang`, English when that language doesn't have it yet. */
export function translate(lang: LanguageCode, key: TextKey, vars?: Record<string, string | number>): string {
  const text = DICTIONARIES[lang]?.[key] ?? en[key] ?? key;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}
