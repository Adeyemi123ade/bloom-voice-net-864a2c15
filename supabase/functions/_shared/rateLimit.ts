// Shared rate limiting for edge functions. Backed by the public.check_rate_limit()
// Postgres function (migration 20260623120100_rate_limits.sql), which only the
// service role may call (migration 20261023150000_rate_limit_hardening.sql).
//
// Keys are stored hashed: the table never holds a raw IP address, email or
// phone number.
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const PRIVATE_IP = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // shared address space inside providers
  /^::1$/,
  /^f[cd][0-9a-f]{2}:/i, // fc00::/7
  /^fe80:/i,
];
const isPrivate = (ip: string) => PRIVATE_IP.some((re) => re.test(ip));

/**
 * The caller's public IP address.
 *
 * x-forwarded-for is a list: whatever the client sent comes first, and each
 * proxy appends the address it saw. The first entry can therefore be faked by
 * the caller, so it is not used. The address added by the platform's proxy is
 * the right-most public one.
 *
 * Logs one line without any address (which entry was used, how many there
 * were, whether cf-connecting-ip agrees) so the choice can be checked in the
 * function logs.
 */
export function clientIp(req: Request): string {
  const chain = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  let fromXff = "";
  for (let i = chain.length - 1; i >= 0; i--) {
    if (!isPrivate(chain[i])) {
      fromXff = chain[i];
      break;
    }
  }
  const cf = (req.headers.get("cf-connecting-ip") ?? "").trim();
  const ip = fromXff || cf || "unknown";
  console.log(
    `[client-ip] used=${fromXff ? "xff-rightmost-public" : cf ? "cf-connecting-ip" : "none"} entries=${chain.length} cf=${
      !cf ? "absent" : cf === ip ? "same" : "differs"
    }`,
  );
  return ip;
}

/** SHA-256 of the value, first 32 hex characters: enough to keep keys apart, never reversible to the value. */
export async function hashForKey(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

/**
 * True when the caller is still within the limit for `bucket` + `subject`
 * (an IP address, a user id, an email, a phone number; stored hashed).
 * Fails open on a database error so a hiccup never blocks sign-up or sign-in.
 */
export async function checkRateLimit(
  admin: SupabaseClient,
  bucket: string,
  subject: string,
  maxCount: number,
  windowSeconds: number,
): Promise<boolean> {
  const { data, error } = await admin.rpc("check_rate_limit", {
    _key: `${bucket}:${await hashForKey(subject)}`,
    _max_count: maxCount,
    _window_seconds: windowSeconds,
  });
  if (error) {
    console.error("check_rate_limit error:", error.message);
    return true;
  }
  return data === true;
}

/**
 * Limits for the public "is this email / phone registered?" checks
 * (check-email-exists, check-registration-availability).
 *
 * - Per network (IP), per function: 60 per 10 minutes and 500 per day. Loose
 *   on purpose: many people on one mobile network can share one address.
 * - Per email and per phone number checked, shared by both functions:
 *   10 per hour. Stops one person's details being probed over and over.
 *
 * When a limit is hit the function answers 429 { error: "rate_limited" } and
 * the app carries on without the answer (sign-up and password reset never
 * depend on it), so a real person is never stopped by these limits.
 */
export const LOOKUP_LIMITS = {
  ipPer10Min: 60,
  ipPerDay: 500,
  perTargetPerHour: 10,
} as const;

export async function withinLookupLimits(
  admin: SupabaseClient,
  req: Request,
  fn: string,
  targets: { email?: string; phone?: string },
): Promise<boolean> {
  const ip = clientIp(req);
  if (!(await checkRateLimit(admin, `${fn}:ip:10m`, ip, LOOKUP_LIMITS.ipPer10Min, 600))) return false;
  if (!(await checkRateLimit(admin, `${fn}:ip:1d`, ip, LOOKUP_LIMITS.ipPerDay, 86400))) return false;
  if (targets.email && !(await checkRateLimit(admin, "lookup:email:1h", targets.email, LOOKUP_LIMITS.perTargetPerHour, 3600))) {
    return false;
  }
  if (targets.phone && !(await checkRateLimit(admin, "lookup:phone:1h", targets.phone, LOOKUP_LIMITS.perTargetPerHour, 3600))) {
    return false;
  }
  return true;
}
