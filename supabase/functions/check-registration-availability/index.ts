import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { withinLookupLimits } from "../_shared/rateLimit.ts";

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

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const E164 = /^\+[1-9]\d{6,14}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "invalid_request" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const phone = String(body.phone ?? "").trim();

    if (!EMAIL.test(email) || email.length > 255 || !E164.test(phone)) {
      return json({ error: "invalid_details" });
    }

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return json({ error: "service_unavailable" }, 500);

    const admin = createClient(url, serviceKey);

    // Limits per network, per email and per phone: see LOOKUP_LIMITS in
    // _shared/rateLimit.ts. The app goes on to sign-up without this answer.
    if (!(await withinLookupLimits(admin, req, "check-registration-availability", { email, phone }))) {
      return json({ error: "rate_limited" }, 429);
    }

    // One indexed lookup in the database (email_registered, server only)
    // instead of paging through the account list.
    const { data: registered, error: emailErr } = await admin.rpc("email_registered", { _email: email });
    if (emailErr) {
      console.error("[check-registration-availability] email lookup failed:", emailErr.message);
      return json({ error: "lookup_failed" }, 500);
    }
    const emailExists = registered === true;

    const { data: phoneOwner, error: phoneErr } = await admin
      .from("profiles")
      .select("id")
      .eq("phone", phone)
      .maybeSingle();

    if (phoneErr) return json({ error: "lookup_failed" }, 500);

    return json({ email_exists: emailExists, phone_exists: !!phoneOwner });
  } catch {
    return json({ error: "bad_request" }, 400);
  }
});
