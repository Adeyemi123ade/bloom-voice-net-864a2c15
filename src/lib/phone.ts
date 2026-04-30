import { parsePhoneNumberFromString, CountryCode } from "libphonenumber-js";

/**
 * Normalize a raw phone string to E.164 (e.g. +2348012345678).
 * Returns null when the number cannot be confidently parsed.
 *
 * `defaultCountry` is used when the input has no leading + (e.g. "08012345678").
 * Falls back to a guess from the browser locale, then "US".
 */
export function toE164(raw: string, defaultCountry?: CountryCode): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d+]/g, "");
  if (!cleaned) return null;

  const country =
    defaultCountry ??
    (guessCountryFromLocale() as CountryCode | undefined) ??
    ("US" as CountryCode);

  try {
    const parsed = parsePhoneNumberFromString(cleaned, country);
    if (parsed?.isValid()) return parsed.number;
  } catch {
    /* ignore */
  }
  return null;
}

function guessCountryFromLocale(): string | undefined {
  try {
    const loc = (navigator.languages?.[0] ?? navigator.language ?? "").split("-");
    return loc[1]?.toUpperCase();
  } catch {
    return undefined;
  }
}

export function countryFromE164(raw: string | null | undefined): CountryCode | undefined {
  if (!raw) return undefined;
  try {
    return parsePhoneNumberFromString(raw)?.country;
  } catch {
    return undefined;
  }
}

/** Best-effort display formatting; falls back to the original string. */
export function formatDisplay(e164: string): string {
  try {
    const p = parsePhoneNumberFromString(e164);
    return p?.formatInternational() ?? e164;
  } catch {
    return e164;
  }
}
