// Edge function: check-email-exists
// Returns whether an email is already registered. Public endpoint (no JWT)
// because it's used during signup/login before the user is authenticated.
// Only returns a boolean — never any user data.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { checkRateLimit, clientIp } from "../_shared/rateLimit.ts";

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

    // Public, unauthenticated email-enumeration surface: 5 a minute and
    // 100 a day per IP.
    const ip = clientIp(req);
    const withinLimit =
      (await checkRateLimit(admin, "check-email-exists", ip, 5, 60)) &&
      (await checkRateLimit(admin, "check-email-exists:1d", ip, 100, 86400));
    if (!withinLimit) {
      return new Response(JSON.stringify({ error: "rate_limited" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Page through users and look for a matching email. The user list is small
    // for this app; for very large bases you'd want a DB function, but the
    // admin API is the safe path here.
    let exists = false;
    let page = 1;
    const perPage = 1000;
    // Cap iterations defensively.
    for (let i = 0; i < 20; i++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) {
        return new Response(JSON.stringify({ error: "lookup_failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const found = data.users.some(
        (u) => (u.email || "").toLowerCase() === normalized,
      );
      if (found) {
        exists = true;
        break;
      }
      if (data.users.length < perPage) break;
      page += 1;
    }

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
