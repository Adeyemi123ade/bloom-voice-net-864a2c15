// Creates a contact in the user's Google Contacts via People API.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const token = auth.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name ?? "").trim();
    const phone = String(body?.phone ?? "").trim();
    if (!name || !phone) return json({ error: "name and phone required" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: row } = await admin
      .from("google_oauth_tokens")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (!row) return json({ error: "Google not connected" }, 400);

    let accessToken = row.access_token as string;
    if (new Date(row.expires_at).getTime() < Date.now() + 60_000 && row.refresh_token) {
      const r = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!,
          client_secret: Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!,
          refresh_token: row.refresh_token,
          grant_type: "refresh_token",
        }),
      });
      const t = await r.json();
      if (r.ok) {
        accessToken = t.access_token;
        await admin.from("google_oauth_tokens").update({
          access_token: t.access_token,
          expires_at: new Date(Date.now() + (t.expires_in ?? 3600) * 1000).toISOString(),
        }).eq("user_id", userId);
      }
    }

    const [given, ...rest] = name.split(/\s+/);
    const family = rest.join(" ");
    const res = await fetch("https://people.googleapis.com/v1/people:createContact", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        names: [{ givenName: given, familyName: family || undefined }],
        phoneNumbers: [{ value: phone, type: "mobile" }],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("google-contacts-create: createContact failed", { status: res.status, response: data });
      return json({ error: data }, res.status);
    }

    return json({ ok: true, resourceName: data.resourceName });
  } catch (e) {
    console.error("google-contacts-create: unhandled error", e);
    return json({ error: String(e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
