// Called from the client right after a Google OAuth sign-in completes.
// New behaviour (per product policy): we DO allow Google for both new and
// existing users. The job of this function is just to tell the client which
// case applies:
//
//   allowed = true  → user already finished registration (has a phone on
//                     profile). Let them straight into the app.
//   allowed = false → user is brand new via Google. Keep the auth session
//                     alive, return the Google email + name so the client
//                     can pre-fill /register, and the user finishes by
//                     calling complete-google-registration.
//
// We also log the attempt to google_signin_attempts so we can detect the
// "wrong Google account picked repeatedly" pattern in
// request-google-step-up-otp.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Was this sign-in via Google?
    const identities = (user.identities || []) as Array<{ provider?: string }>;
    const isGoogle = identities.some((i) => i.provider === "google");
    if (!isGoogle) {
      return new Response(JSON.stringify({ allowed: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Has the user completed registration? Phone on profile = done.
    const { data: profile } = await admin
      .from("profiles")
      .select("phone")
      .eq("id", user.id)
      .maybeSingle();
    const hasPhone = !!profile?.phone;

    if (hasPhone) {
      return new Response(JSON.stringify({ allowed: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Brand-new Google user — needs to finish the form. Keep the session.
    const meta = (user.user_metadata || {}) as Record<string, unknown>;
    const fullName = String(
      meta.full_name || meta.name || meta.display_name || "",
    ).trim();
    const email = (user.email || "").toLowerCase();

    return new Response(JSON.stringify({
      allowed: false,
      pending_registration: true,
      email,
      full_name: fullName,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch {
    return new Response(JSON.stringify({ error: "bad_request" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
