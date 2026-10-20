import { tNow } from "@/lib/i18n/language";
// Client copy of the paid-call country list, so the app can explain a
// refusal before trying. The server (supabase/functions/_shared/
// paidCallRules.ts) is what actually enforces it; keep the two in step.

const ALLOWED: RegExp[] = [
  /^\+234[1-9]\d{6,9}$/, // Nigeria
  /^\+971(5\d{8}|[234679]\d{7})$/, // UAE (no 600/700/800/900 numbers)
];

export function normalisePhone(raw: string): string {
  const trimmed = (raw ?? "").trim();
  const digits = trimmed.replace(/[^\d]/g, "");
  if (trimmed.startsWith("00")) return `+${digits.slice(2)}`;
  return `+${digits}`;
}

export function isCallableNumber(raw: string): boolean {
  const e164 = normalisePhone(raw);
  return ALLOWED.some((re) => re.test(e164));
}

export type PaidCallBlock = "country" | "too_new" | "daily_limit";

/** Plain wording shown to the person when a phone call can't be made. */
export function paidCallMessage(reason: PaidCallBlock): string {
  switch (reason) {
    case "country":
      return tNow("pc.country");
    case "too_new":
      return tNow("pc.tooNew");
    case "daily_limit":
      return tNow("pc.dailyLimit");
  }
}
