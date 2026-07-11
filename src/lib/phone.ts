import { parsePhoneNumberFromString, validatePhoneNumberLength, CountryCode } from "libphonenumber-js";

/**
 * Normalize a raw phone string to E.164 (e.g. +2348012345678).
 * Returns null when the number cannot be confidently parsed.
 *
 * Tries NG first (primary market), then the provided default country,
 * then locale guess, then US as last resort.
 */
export function toE164(raw: string, defaultCountry?: CountryCode): string | null {
    if (!raw) return null;
    const cleaned = raw.replace(/[^\d+]/g, "");
    if (!cleaned) return null;

    if (cleaned.startsWith("+")) {
        try {
            const parsed = parsePhoneNumberFromString(cleaned);
            if (parsed?.isValid()) return parsed.number;
        } catch { /* ignore */ }
    }

    const countriesToTry: CountryCode[] = [
        ...(defaultCountry ? [defaultCountry] : []),
        "NG",
        (guessCountryFromLocale() as CountryCode | undefined) ?? "US",
        "US",
    ];

    for (const country of countriesToTry) {
        try {
            const parsed = parsePhoneNumberFromString(cleaned, country);
            if (parsed?.isValid()) return parsed.number;
        } catch { /* ignore */ }
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

/**
 * True once `localDigits` already has more digits than the selected
 * country's numbers can have — used to stop accepting further keystrokes
 * in phone inputs instead of only rejecting the whole number on submit.
 */
export function isTooManyDigits(localDigits: string, country: CountryCode): boolean {
    if (!localDigits) return false;
    try {
        return validatePhoneNumberLength(localDigits, country) === "TOO_LONG";
    } catch {
        return false;
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