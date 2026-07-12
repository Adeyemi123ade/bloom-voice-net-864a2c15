// Exchanges Google OAuth authorization code for tokens and stores them per user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const CONTACTS_SCOPE = "https://www.googleapis.com/auth/contacts";
const CONTACTS_READONLY_SCOPE = "https://www.googleapis.com/auth/contacts.readonly";
const DIRECTORY_SCOPE = "https://www.googleapis.com/auth/directory.readonly";
const SCOPES = [
  CONTACTS_SCOPE, 
  DIRECTORY_SCOPE,
  "https://www.googleapis.com/auth/userinfo.email"
];
const CANONICAL_REDIRECT_URI = "https://chichatapp.com/settings";

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

    const body = await req.json().catch(() => ({}));
    const action = body.action as string | undefined;

    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!;
    const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!;

    if (action === "auth_url") {
      const redirectUri = normalizeRedirectUri(body.redirect_uri as string | undefined);
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", SCOPES.join(" "));
      url.searchParams.set("access_type", "offline");
      url.searchParams.set("prompt", "consent");
      url.searchParams.set("state", user.id);
      return json({ url: url.toString() });
    }

    if (action === "exchange") {
      // The `state` param is set to the initiating user's id in the
      // "auth_url" action above and echoed back by Google unmodified. Verify
      // it matches the CURRENT caller before redeeming the code — otherwise
      // an attacker could get their own Google account linked to a victim's
      // ChiChat account by getting the victim to submit the attacker's code
      // (CSRF / account-linking confusion).
      const state = body.state as string | undefined;
      if (!state || state !== user.id) {
        return json({ error: "Invalid or missing OAuth state" }, 401);
      }

      const code = body.code as string;
      const redirectUri = normalizeRedirectUri(body.redirect_uri as string | undefined);
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });
      const tokens = await tokenRes.json();
      if (!tokenRes.ok) {
        console.error("google-oauth-callback: token exchange failed", {
          status: tokenRes.status,
          redirectUri,
          clientIdPrefix: clientId?.slice(0, 20),
          response: tokens,
        });
        return json({ error: tokens }, 400);
      }

      // get email
      let email: string | null = null;
      try {
        const ui = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        }).then((r) => r.json());
        email = ui.email ?? null;
      } catch { /* ignore */ }

      const grantedScope = String(tokens.scope ?? "");
      if (grantedScope && !hasContactsScope(grantedScope)) {
        return json({
          error: "Google contacts permission was not granted. Please reconnect and allow Contacts access.",
          reconnectRequired: true,
        }, 400);
      }

      const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      await admin.from("google_oauth_tokens").upsert({
        user_id: user.id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        scope: tokens.scope ?? SCOPES.join(" "),
        token_type: tokens.token_type ?? "Bearer",
        expires_at: expiresAt,
        google_email: email,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

      return json({ ok: true, email });
    }

    return json({ error: "Unknown action" }, 400);
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

function hasContactsScope(scope: string) {
  const granted = new Set(scope.split(/\s+/).filter(Boolean));
  return granted.has(CONTACTS_SCOPE) || granted.has(CONTACTS_READONLY_SCOPE);
}

function normalizeRedirectUri(redirectUri?: string) {
  if (redirectUri?.startsWith("http://localhost")) return redirectUri;
  return CANONICAL_REDIRECT_URI;
}
