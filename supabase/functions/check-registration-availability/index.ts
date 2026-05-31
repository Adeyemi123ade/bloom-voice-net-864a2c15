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

    let emailExists = false;
    let page = 1;
    const perPage = 1000;
    for (let i = 0; i < 20; i++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) return json({ error: "lookup_failed" }, 500);
      if (data.users.some((u) => (u.email || "").toLowerCase() === email)) {
        emailExists = true;
        break;
      }
      if (data.users.length < perPage) break;
      page += 1;
    }

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
