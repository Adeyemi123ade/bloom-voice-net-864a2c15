import { getCountries, getCountryCallingCode, CountryCode } from "libphonenumber-js";

// Friendly names via Intl
const dn = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();

export interface CountryEntry {
  code: CountryCode;
  name: string;
  dial: string; // without "+"
  flag: string;
}

function flagEmoji(cc: string) {
  return cc
    .toUpperCase()
    .split("")
    .map((c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
    .join("");
}

let cache: CountryEntry[] | null = null;

export function allCountries(): CountryEntry[] {
  if (cache) return cache;
  const list: CountryEntry[] = getCountries().map((code) => ({
    code,
    name: dn?.of(code) ?? code,
    dial: getCountryCallingCode(code),
    flag: flagEmoji(code),
  }));
  list.sort((a, b) => a.name.localeCompare(b.name));
  cache = list;
  return list;
}

export function findByDialPrefix(e164: string): CountryEntry | null {
  if (!e164.startsWith("+")) return null;
  const digits = e164.slice(1);
  // Try longest match first (up to 4 digits)
  const list = allCountries();
  for (let len = 4; len >= 1; len--) {
    const prefix = digits.slice(0, len);
    const hit = list.find((c) => c.dial === prefix);
    if (hit) return hit;
  }
  return null;
}
