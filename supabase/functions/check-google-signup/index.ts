// Called from the client immediately after a Google OAuth sign-in completes.
// If the user account was just created (within the last 60s) AND was created
// via Google (no email/password identity yet) AND the profile has no phone
// number, we treat this as a "Google sign-up", which is forbidden by product
// policy. We delete the auth user so the email is freed up, and return the
// Google-supplied name/email so the client can pre-fill the register form.
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

    // Did this user sign in via Google? Check identity providers.
    const identities = (user.identities || []) as Array<{ provider?: string }>;
    const googleOnly = identities.length > 0 && identities.every((i) => i.provider === "google");
    if (!googleOnly) {
      return new Response(JSON.stringify({ allowed: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Was the account created very recently? (= sign-UP, not sign-IN)
    const createdAt = new Date(user.created_at).getTime();
    const justCreated = Date.now() - createdAt < 60_000;

    // Has the user completed registration (phone is required by our form)?
    const { data: profile } = await admin
      .from("profiles")
      .select("phone")
      .eq("id", user.id)
      .maybeSingle();
    const hasPhone = !!profile?.phone;

    if (!justCreated || hasPhone) {
      return new Response(JSON.stringify({ allowed: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // It's a brand-new Google sign-up — block it.
    const meta = (user.user_metadata || {}) as Record<string, unknown>;
    const fullName = String(
      meta.full_name || meta.name || meta.display_name || "",
    ).trim();
    const email = (user.email || "").toLowerCase();

    // Sign the user out everywhere, then remove the account.
    await admin.auth.admin.signOut(user.id, "global");
    await admin.auth.admin.deleteUser(user.id);

    return new Response(JSON.stringify({
      allowed: false,
      email,
      full_name: fullName,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch {
    return new Response(JSON.stringify({ error: "bad_request" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
