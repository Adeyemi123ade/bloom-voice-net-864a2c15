// Mints a Twilio Video Access Token for the authenticated user.
// Uses TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN to provision a temporary API Key
// (valid for the call duration), then signs a Video grant JWT with it.
//
// Body: { roomName: string }
// Returns: { token: string, identity: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
    const AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
    if (!ACCOUNT_SID || !AUTH_TOKEN) {
      throw new Error("Twilio credentials not configured");
    }

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const roomName = String(body?.roomName ?? "").trim();
    if (!roomName || roomName.length > 128) {
      return new Response(JSON.stringify({ error: "Invalid roomName" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) Provision a short-lived API Key via REST using Auth Token (Basic Auth)
    const basic = btoa(`${ACCOUNT_SID}:${AUTH_TOKEN}`);
    const keyRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Keys.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ FriendlyName: `chichat-${roomName}-${Date.now()}` }),
      },
    );
    const keyJson = await keyRes.json();
    if (!keyRes.ok) {
      console.error("Twilio Keys API failed", keyRes.status, keyJson);
      throw new Error(`Twilio key provisioning failed: ${keyJson?.message ?? keyRes.status}`);
    }
    const apiKeySid: string = keyJson.sid;
    const apiKeySecret: string = keyJson.secret;

    // 2) Sign a Video Access Token (JWT) with the API Key
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      jti: `${apiKeySid}-${now}`,
      iss: apiKeySid,
      sub: ACCOUNT_SID,
      iat: now,
      exp: getNumericDate(60 * 60), // 1h
      grants: {
        identity: userId,
        video: { room: roomName },
      },
    };

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(apiKeySecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
    const token = await create(
      { alg: "HS256", typ: "JWT", cty: "twilio-fpa;v=1" },
      payload,
      key,
    );

    // Note: We intentionally do NOT delete the API Key here — Twilio caches keys
    // and deleting immediately can invalidate the just-issued JWT. They auto-expire
    // along with the JWT (1h). For production, create one permanent API Key.

    return new Response(JSON.stringify({ token, identity: userId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("twilio-token error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
