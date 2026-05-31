import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

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

const E164 = /^\+[1-9]\d{6,14}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "invalid_request" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const identifier = String(body.identifier ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");

    if (!identifier || !password || password.length > 72) {
      return json({ error: "missing_details" }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) return json({ error: "service_unavailable" }, 500);

    const admin = createClient(url, serviceKey);
    const authClient = createClient(url, anonKey);

    let email = "";
    const isEmail = EMAIL.test(identifier);
    const isPhone = E164.test(identifier);

    if (isPhone) {
      const { data: profile, error: profileErr } = await admin
        .from("profiles")
        .select("id")
        .eq("phone", identifier)
        .maybeSingle();

      if (profileErr) return json({ error: "lookup_failed" }, 500);
      if (!profile?.id) return json({ error: "phone_not_registered" }, 404);

      const { data: userRes, error: userErr } = await admin.auth.admin.getUserById(profile.id);
      if (userErr || !userRes.user?.email) return json({ error: "phone_not_registered" }, 404);
      email = userRes.user.email.toLowerCase();
    } else if (isEmail) {
      email = identifier;
      let exists = false;
      let page = 1;
      const perPage = 1000;
      for (let i = 0; i < 20; i++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
        if (error) return json({ error: "lookup_failed" }, 500);
        if (data.users.some((u) => (u.email || "").toLowerCase() === email)) {
          exists = true;
          break;
        }
        if (data.users.length < perPage) break;
        page += 1;
      }
      if (!exists) return json({ error: "email_not_registered" }, 404);
    } else {
      return json({ error: "invalid_identifier" }, 400);
    }

    const { data, error } = await authClient.auth.signInWithPassword({ email, password });
    if (error) {
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("confirm") || msg.includes("verified")) return json({ error: "email_not_verified" }, 403);
      return json({ error: "wrong_password" }, 401);
    }

    return json({ session: data.session, user: data.user });
  } catch {
    return json({ error: "bad_request" }, 400);
  }
});
