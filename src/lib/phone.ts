import { parsePhoneNumberFromString, validatePhoneNumberLength, CountryCode } from "libphonenumber-js";
import examples from "libphonenumber-js/examples.mobile.json";
import { supabase } from "@/integrations/supabase/client";

/**
 * Normalize a raw phone string to E.164 (e.g. +2348012345678).
 * Returns null when the number cannot be confidently parsed.
 *
 * Phone books store the same number many ways; all of these give +2348031234567:
 *   0803 123 4567 (with a Nigerian default), +234 803 123 4567,
 *   00234 803 123 4567 (international dialling prefix), 234 803 123 4567
 *   (country code without the +).
 * Local numbers are read with, in order: the given default country (the
 * person's own, from their saved number), the country this phone is in
 * (time zone), Nigeria, the language setting's region, then the US.
 */
export function toE164(raw: string, defaultCountry?: CountryCode): string | null {
    if (!raw) return null;
    let cleaned = raw.replace(/[^\d+]/g, "");
    if (!cleaned) return null;
    // 00 is the international dialling prefix in most of the world.
    if (cleaned.startsWith("00")) cleaned = "+" + cleaned.slice(2);

    if (cleaned.startsWith("+")) {
        try {
            const parsed = parsePhoneNumberFromString(cleaned);
            if (parsed?.isValid()) return parsed.number;
        } catch { /* ignore */ }
    }

    const countriesToTry: CountryCode[] = [];
    for (const c of [defaultCountry, guessCountryFromTimeZone(), "NG", guessCountryFromLocale(), "US"]) {
        if (c && !countriesToTry.includes(c as CountryCode)) countriesToTry.push(c as CountryCode);
    }

    for (const country of countriesToTry) {
        try {
            const parsed = parsePhoneNumberFromString(cleaned, country);
            if (parsed?.isValid()) return parsed.number;
        } catch { /* ignore */ }
    }

    // A country code written without the + (e.g. 971 50 123 4567). Only for
    // numbers long enough to carry one, so a short local number is never
    // read as some other country's.
    if (!cleaned.startsWith("+") && !cleaned.startsWith("0") && cleaned.length >= 11) {
        try {
            const parsed = parsePhoneNumberFromString("+" + cleaned);
            if (parsed?.isValid()) return parsed.number;
        } catch { /* ignore */ }
    }
    return null;
}

function guessCountryFromLocale(): CountryCode | undefined {
    try {
        const loc = (navigator.languages?.[0] ?? navigator.language ?? "").split("-");
        return loc[1]?.toUpperCase() as CountryCode | undefined;
    } catch {
        return undefined;
    }
}

/**
 * Where this phone is, from its time zone, for the countries ChiChat is used
 * in most. A phone in Dubai set to English (US) still reads 050… as a UAE
 * number. Unknown zones give undefined (the other guesses apply).
 */
const ZONE_COUNTRY: Record<string, CountryCode> = {
    "Asia/Dubai": "AE",
    "Africa/Lagos": "NG",
    "Africa/Accra": "GH",
    "Africa/Nairobi": "KE",
    "Africa/Johannesburg": "ZA",
    "Asia/Riyadh": "SA",
    "Asia/Qatar": "QA",
    "Asia/Kuwait": "KW",
    "Asia/Bahrain": "BH",
    "Asia/Muscat": "OM",
    "Europe/London": "GB",
    "Asia/Kolkata": "IN",
    "Asia/Calcutta": "IN",
    "America/Toronto": "CA",
};

export function guessCountryFromTimeZone(): CountryCode | undefined {
    try {
        return ZONE_COUNTRY[Intl.DateTimeFormat().resolvedOptions().timeZone];
    } catch {
        return undefined;
    }
}

/** Best first guess for a country picker when the person's own number isn't known. */
export function guessMyCountry(): CountryCode {
    return guessCountryFromTimeZone() ?? guessCountryFromLocale() ?? "NG";
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
 * The signed-in user's own country, derived from their registered E.164
 * phone number — used as the `defaultCountry` hint for normalizing other
 * people's phone numbers (device contacts, Google contacts) that were saved
 * in local format with no country code. Without this hint, `toE164` falls
 * back to guessing NG first for any such number, which is wrong for anyone
 * outside Nigeria. Shared by every contact-import path so there is exactly
 * one place this lookup happens.
 */
export async function getMyDefaultCountry(): Promise<CountryCode | undefined> {
    try {
        const { data } = await supabase.rpc("get_my_profile_private");
        const row = Array.isArray(data) ? data[0] : data;
        return countryFromE164((row as { phone?: string | null } | null)?.phone);
    } catch {
        return undefined;
    }
}

const mobileDigitLengthCache = new Map<string, number | null>();

/**
 * How many digits a normal mobile number has in this country (e.g. 10 for
 * NG, 9 for GH), derived from libphonenumber-js's example mobile number.
 * NOT the same as "any length libphonenumber-js considers plausible" —
 * validatePhoneNumberLength alone accepts the union of every number
 * category a country has (mobile, premium-rate, etc.), which for NG spans
 * 10-14 digits — far too loose for capping an ordinary mobile input.
 */
function mobileDigitLength(country: CountryCode): number | null {
    if (mobileDigitLengthCache.has(country)) return mobileDigitLengthCache.get(country)!;
    let length: number | null = null;
    try {
        const example = (examples as Record<string, string>)[country];
        const parsed = example ? parsePhoneNumberFromString(example, country) : null;
        length = parsed?.nationalNumber?.length ?? null;
    } catch {
        length = null;
    }
    mobileDigitLengthCache.set(country, length);
    return length;
}

/**
 * True once `localDigits` already has more digits than a normal mobile
 * number in the selected country has — used to stop accepting further
 * keystrokes in phone inputs instead of only rejecting on submit.
 */
export function isTooManyDigits(localDigits: string, country: CountryCode): boolean {
    if (!localDigits) return false;
    const expected = mobileDigitLength(country);
    if (expected != null) return localDigits.length > expected;
    // No example number for this country — fall back to the looser
    // (but still correct) length-range check rather than no limit at all.
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