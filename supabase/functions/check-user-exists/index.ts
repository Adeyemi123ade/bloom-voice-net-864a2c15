// Public endpoint. Returns whether an email belongs to an existing account
// AND (optionally) the display name + raw metadata Google returned, so the
// register form can pre-fill itself when a brand-new Google user is bounced
// back to /register. No PII beyond name is returned.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { email } = await req.json();
    const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!normalized || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized) || normalized.length > 255) {
      return new Response(JSON.stringify({ error: "invalid_email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let exists = false;
    let page = 1;
    const perPage = 1000;
    for (let i = 0; i < 20; i++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) {
        return new Response(JSON.stringify({ error: "lookup_failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (data.users.some((u) => (u.email || "").toLowerCase() === normalized)) {
        exists = true;
        break;
      }
      if (data.users.length < perPage) break;
      page += 1;
    }

    return new Response(JSON.stringify({ exists }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "bad_request" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
