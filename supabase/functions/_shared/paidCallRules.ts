// Rules for paid calls to real phone numbers (dial pad / "Call phone").
// Every one of these minutes is billed to the ChiChat Twilio account, so the
// limits live on the server and are enforced in twilio-voice-token (before a
// call can start) and again in twilio-voice-twiml (the only place a phone
// number is actually dialled). Keep src/lib/paidCallRules.ts in step with
// the country list so the app can explain a refusal before trying.

/** Countries ChiChat may call. Add a country only after enabling it in
 *  Twilio's Voice Geo Permissions too. */
export const ALLOWED_COUNTRIES: { code: string; name: string; pattern: RegExp }[] = [
  // Nigeria: +234 then a national number without the leading 0
  // (mobiles are 10 digits, landlines 7 to 9).
  { code: "234", name: "Nigeria", pattern: /^\+234[1-9]\d{6,9}$/ },
  // UAE: mobiles +971 5x (9 digits), landlines +971 2/3/4/6/7/9 (8 digits).
  // Shared-cost / premium ranges (600, 700, 800, 900) are not allowed.
  { code: "971", name: "UAE", pattern: /^\+971(5\d{8}|[234679]\d{7})$/ },
];

/** Longest single paid call. */
export const MAX_CALL_SECONDS = 30 * 60;

/** New accounts wait this long before they can make paid calls (unless an
 *  admin switched the dial pad on for them or they are on Premium). */
export const NEW_ACCOUNT_WAIT_MS = 24 * 60 * 60 * 1000;

/** Why a dial pad call can't be made. Everything except "country" comes
 *  from the database (paid_call_check), where each person's plan, switch,
 *  daily minutes and balance are kept. */
export type PaidCallRefusal =
  | "country"
  | "suspended"
  | "off"
  | "too_new"
  | "busy"
  | "daily_limit"
  | "no_balance"
  | "error";

export type PaidCallDecision =
  | { allowed: true; seconds: number; id?: string }
  | { allowed: false; reason: PaidCallRefusal; dailyMinutes?: number };

const KNOWN: PaidCallRefusal[] = ["suspended", "off", "too_new", "busy", "daily_limit", "no_balance"];

/** Reads the database answer. Anything unexpected refuses the call. */
export function readDecision(data: unknown): PaidCallDecision {
  const d = (data ?? {}) as Record<string, unknown>;
  if (d.allowed === true) {
    const seconds = Number(d.seconds ?? d.seconds_left);
    if (!Number.isFinite(seconds) || seconds < 30) return { allowed: false, reason: "error" };
    return {
      allowed: true,
      seconds: Math.min(Math.floor(seconds), MAX_CALL_SECONDS),
      id: typeof d.id === "string" ? d.id : undefined,
    };
  }
  const reason = KNOWN.includes(d.reason as PaidCallRefusal) ? (d.reason as PaidCallRefusal) : "error";
  const dailyMinutes = Number(d.daily_minutes);
  return Number.isFinite(dailyMinutes)
    ? { allowed: false, reason, dailyMinutes }
    : { allowed: false, reason };
}

/** May this person start a dial pad call now? (Nothing is recorded.) */
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function checkPaidCall(admin: any, userId: string): Promise<PaidCallDecision> {
  const { data, error } = await admin.rpc("paid_call_check", { _uid: userId });
  if (error) {
    console.error("paid_call_check failed", error.message);
    return { allowed: false, reason: "error" };
  }
  return readDecision(data);
}

/** Check and record the call in one database step, so two calls at once
 *  can't both pass the limits. */
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function beginPaidCall(admin: any, userId: string, to: string, callSid: string | null): Promise<PaidCallDecision> {
  const { data, error } = await admin.rpc("paid_call_begin", { _uid: userId, _to: to, _call_sid: callSid });
  if (error) {
    console.error("paid_call_begin failed", error.message);
    return { allowed: false, reason: "error" };
  }
  const decision = readDecision(data);
  if (decision.allowed && !decision.id) return { allowed: false, reason: "error" };
  return decision;
}

export function normaliseNumber(raw: string): string {
  const trimmed = (raw ?? "").trim();
  const digits = trimmed.replace(/[^\d]/g, "");
  if (trimmed.startsWith("+")) return `+${digits}`;
  if (trimmed.startsWith("00")) return `+${digits.slice(2)}`;
  return `+${digits}`;
}

export function isAllowedNumber(e164: string): boolean {
  return ALLOWED_COUNTRIES.some((c) => c.pattern.test(e164));
}
