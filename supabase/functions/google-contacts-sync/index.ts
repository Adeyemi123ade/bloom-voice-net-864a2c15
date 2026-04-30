// Fetches contacts from Google People API for the authenticated user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const CONTACTS_SCOPE = "https://www.googleapis.com/auth/contacts";
const CONTACTS_READONLY_SCOPE = "https://www.googleapis.com/auth/contacts.readonly";

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
    const user = { id: claims.claims.sub as string };

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: row } = await admin
      .from("google_oauth_tokens")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!row) return json({ error: "Not connected" }, 400);

    let accessToken = row.access_token;
    if (new Date(row.expires_at).getTime() < Date.now() + 60000 && row.refresh_token) {
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
        }).eq("user_id", user.id);
      }
    }

    const contacts: { name: string; phones: string[] }[] = [];
    let pageToken: string | undefined;
    do {
      const url = new URL("https://people.googleapis.com/v1/people/me/connections");
      url.searchParams.set("personFields", "names,phoneNumbers");
      url.searchParams.set("pageSize", "500");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      const data = await res.json();
      if (!res.ok) {
        if (isInsufficientScope(data)) {
          await admin.from("google_oauth_tokens").delete().eq("user_id", user.id);
          return json({
            error: "Google contacts permission is missing. Please reconnect Google Contacts.",
            reconnectRequired: true,
          }, 400);
        }
        return json({ error: data }, 400);
      }
      for (const p of data.connections ?? []) {
        const name = p.names?.[0]?.displayName ?? "";
        const phones = (p.phoneNumbers ?? []).map((n: { value: string }) => n.value).filter(Boolean);
        if (name && phones.length) contacts.push({ name, phones });
      }
      pageToken = data.nextPageToken;
    } while (pageToken);

    return json({ contacts });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isInsufficientScope(data: any) {
  if (data?.error?.status === "PERMISSION_DENIED") return true;
  const details = data?.error?.details ?? [];
  return details.some((d: any) =>
    d?.reason === "ACCESS_TOKEN_SCOPE_INSUFFICIENT" ||
    d?.metadata?.service === "people.googleapis.com"
  );
}

function hasContactsScope(scope: string | null | undefined) {
  const granted = new Set(String(scope ?? "").split(/\s+/).filter(Boolean));
  return granted.has(CONTACTS_SCOPE) || granted.has(CONTACTS_READONLY_SCOPE);
}
