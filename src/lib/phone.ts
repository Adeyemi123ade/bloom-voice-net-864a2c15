import { parsePhoneNumberFromString, validatePhoneNumberLength, CountryCode } from "libphonenumber-js";
import examples from "libphonenumber-js/examples.mobile.json";
import { supabase } from "@/integrations/supabase/client";

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