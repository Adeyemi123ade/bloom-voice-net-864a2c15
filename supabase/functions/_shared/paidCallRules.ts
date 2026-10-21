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

/** Minutes of paid calls one person may use per day (UTC day). */
export const DAILY_LIMIT_SECONDS = 30 * 60;

/** Longest single paid call. */
export const MAX_CALL_SECONDS = 30 * 60;

/** New accounts wait this long before they can make paid calls. */
export const NEW_ACCOUNT_WAIT_MS = 24 * 60 * 60 * 1000;

export type PaidCallRefusal = "country" | "too_new" | "daily_limit";

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

export function isAccountTooNew(createdAt: string | null | undefined, now = Date.now()): boolean {
  if (!createdAt) return true;
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return true;
  return now - t < NEW_ACCOUNT_WAIT_MS;
}

export function startOfUtcDay(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

type UsageRow = { started_at: string; duration_seconds: number | null; max_seconds: number };

/** Seconds used today. A call still running (or whose end report never
 *  arrived) counts for the time since it started, up to its own limit. */
export function secondsUsed(rows: UsageRow[], now = Date.now()): number {
  let total = 0;
  for (const r of rows) {
    if (r.duration_seconds != null) {
      total += Math.max(0, r.duration_seconds);
    } else {
      const elapsed = Math.floor((now - Date.parse(r.started_at)) / 1000);
      total += Math.max(0, Math.min(elapsed, r.max_seconds));
    }
  }
  return total;
}

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadUsage(admin: any, userId: string): Promise<number> {
  const { data, error } = await admin
    .from("outbound_calls")
    .select("started_at, duration_seconds, max_seconds")
    .eq("user_id", userId)
    .gte("started_at", startOfUtcDay());
  if (error) throw new Error(`usage lookup failed: ${error.message}`);
  return secondsUsed((data ?? []) as UsageRow[]);
}

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadAccountCreatedAt(admin: any, userId: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) throw new Error(`user lookup failed: ${error.message}`);
  return data?.user?.created_at ?? null;
}

/** True when an admin suspended this account. Treated as not suspended if it can't be checked. */
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function isAccountSuspended(admin: any, userId: string): Promise<boolean> {
  try {
    const { data, error } = await admin
      .from("account_status")
      .select("status")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return false;
    return data?.status === "suspended";
  } catch {
    return false;
  }
}
