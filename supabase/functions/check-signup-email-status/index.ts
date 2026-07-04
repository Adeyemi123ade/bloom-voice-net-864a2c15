// Edge function: check-signup-email-status
// Public endpoint (no JWT) — lets the verify-email screen find out whether
// the OTP email actually got sent, instead of just assuming success because
// signUp()/resend() didn't throw. Those calls only confirm the email was
// *enqueued* (auth-email-hook ran); actual delivery happens later via the
// process-email-queue dispatcher, so this reads the real outcome from
// email_send_log.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { checkRateLimit, clientIp } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const FAILURE_STATUSES = new Set(["failed", "dlq", "suppressed", "bounced", "complained"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "invalid_request" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return json({ error: "invalid_email" }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return json({ error: "service_unavailable" }, 500);

    const admin = createClient(url, serviceKey);

    const ip = clientIp(req);
    const withinLimit = await checkRateLimit(admin, "check-signup-email-status", ip, 20, 60);
    if (!withinLimit) return json({ error: "rate_limited" }, 429);

    const { data, error } = await admin
      .from("email_send_log")
      .select("status, created_at")
      .eq("recipient_email", email)
      .eq("template_name", "signup")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return json({ error: "lookup_failed" }, 500);
    if (!data) return json({ status: "unknown" });

    return json({
      status: data.status,
      failed: FAILURE_STATUSES.has(data.status),
    });
  } catch {
    return json({ error: "bad_request" }, 400);
  }
});
