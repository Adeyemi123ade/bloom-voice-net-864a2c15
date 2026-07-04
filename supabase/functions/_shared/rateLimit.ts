// Shared per-IP rate limiting helper for public, unauthenticated edge
// functions. Backed by the public.check_rate_limit() Postgres function
// (see migration 20260623120100_rate_limits.sql).
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") ?? "unknown";
}

// Returns true if the caller is still within the allowed rate.
export async function checkRateLimit(
  admin: SupabaseClient,
  bucket: string,
  ip: string,
  maxCount: number,
  windowSeconds: number,
): Promise<boolean> {
  const { data, error } = await admin.rpc("check_rate_limit", {
    _key: `${bucket}:${ip}`,
    _max_count: maxCount,
    _window_seconds: windowSeconds,
  });
  if (error) {
    // Fail open on infra errors so a DB hiccup doesn't take down signup/login.
    console.error("check_rate_limit error:", error.message);
    return true;
  }
  return data === true;
}
