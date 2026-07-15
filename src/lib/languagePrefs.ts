import { LANGUAGES } from "@/lib/languages";

// The language voice-note transcripts get translated into for this device.
// Defaults to the browser/device language (no setup required to work out of
// the box), stored locally so it can still be overridden in Phone settings.
const STORAGE_KEY = "chichat:preferred-language";

function detectDefault(): string {
  const nav = typeof navigator !== "undefined" ? navigator.language : "en";
  const code = (nav || "en").slice(0, 2).toLowerCase();
  return LANGUAGES.some((l) => l.code === code) ? code : "en";
}

export function getPreferredLanguage(): string {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v) return v;
  } catch {
    /* ignore */
  }
  return detectDefault();
}

export function setPreferredLanguage(code: string) {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* ignore */
  }
}
