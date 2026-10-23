// Edge function: check-email-exists
// Returns whether an email is already registered. Public endpoint (no JWT)
// because it's used during signup/login before the user is authenticated.
// Only returns a boolean — never any user data.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { withinLookupLimits } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const { email } = await req.json();
    const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!normalized || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
      return new Response(JSON.stringify({ error: "invalid_email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (normalized.length > 255) {
      return new Response(JSON.stringify({ error: "invalid_email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Limits per network and per email: see LOOKUP_LIMITS in _shared/rateLimit.ts.
    if (!(await withinLookupLimits(admin, req, "check-email-exists", { email: normalized }))) {
      return new Response(JSON.stringify({ error: "rate_limited" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // One indexed lookup in the database (email_registered, server only)
    // instead of paging through the account list.
    const { data: registered, error: lookupErr } = await admin.rpc("email_registered", { _email: normalized });
    if (lookupErr) {
      console.error("[check-email-exists] lookup failed:", lookupErr.message);
      return new Response(JSON.stringify({ error: "lookup_failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const exists = registered === true;

    // If no live account, check deletion log so the UI can say "this account
    // was deleted" instead of a generic "no account found".
    let deleted = false;
    if (!exists) {
      const { data: del } = await admin
        .from("deleted_accounts")
        .select("id")
        .eq("email", normalized)
        .limit(1)
        .maybeSingle();
      deleted = !!del;
    }

    return new Response(JSON.stringify({ exists, deleted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (_e) {
    return new Response(JSON.stringify({ error: "bad_request" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
