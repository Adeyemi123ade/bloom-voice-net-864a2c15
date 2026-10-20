import { DICTIONARIES, en, LANGUAGES, type Dictionary, type LanguageCode, type TextKey } from "./strings";

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

/** Languages that download when chosen (keeps them out of the app's first load). */
const LOADERS: Partial<Record<LanguageCode, () => Promise<{ default: Dictionary }>>> = {
  fr: () => import("./langs/fr"),
  es: () => import("./langs/es"),
  pt: () => import("./langs/pt"),
  de: () => import("./langs/de"),
  ar: () => import("./langs/ar"),
  zh: () => import("./langs/zh"),
  hi: () => import("./langs/hi"),
  ja: () => import("./langs/ja"),
  sw: () => import("./langs/sw"),
  ru: () => import("./langs/ru"),
  tr: () => import("./langs/tr"),
};

export function isLanguageReady(code: LanguageCode): boolean {
  return !!DICTIONARIES[code];
}

/** Makes sure a language's text is here; resolves at once for built-in ones. */
export async function loadLanguage(code: LanguageCode): Promise<void> {
  if (DICTIONARIES[code]) return;
  const load = LOADERS[code];
  if (!load) return;
  try {
    DICTIONARIES[code] = (await load()).default;
  } catch {
    /* offline: shows English until it can load */
  }
}

export function languageDir(code: LanguageCode): "ltr" | "rtl" {
  return LANGUAGES.find((l) => l.code === code)?.dir ?? "ltr";
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

/**
 * For text made outside the screens (helpers, notifications): uses the
 * language saved on this phone. Screens use useLanguage() instead, so they
 * change at once when the language is switched.
 */
export function tNow(key: TextKey, vars?: Record<string, string | number>): string {
  return translate(initialLanguage(), key, vars);
}

/** Locale for dates and times, matching the chosen language (falls back to the phone's own). */
export function appLocale(): string[] {
  return [initialLanguage()];
}
