// Mints a Twilio Video Access Token using a permanent API Key (SK.../secret).
// Body: { roomName: string }  → { token: string, identity: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID")?.trim();
    const API_KEY_SID = Deno.env.get("TWILIO_API_KEY_SID")?.trim();
    const API_KEY_SECRET = Deno.env.get("TWILIO_API_KEY_SECRET")?.trim();
    if (!ACCOUNT_SID || !API_KEY_SID || !API_KEY_SECRET) {
      throw new Error("Twilio credentials not configured");
    }

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
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      console.error("getClaims failed:", claimsErr?.message);
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

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      jti: `${API_KEY_SID}-${now}`,
      iss: API_KEY_SID,
      sub: ACCOUNT_SID,
      iat: now,
      exp: getNumericDate(60 * 60),
      grants: {
        identity: userId,
        video: { room: roomName },
      },
    };

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(API_KEY_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
    const token = await create(
      { alg: "HS256", typ: "JWT", cty: "twilio-fpa;v=1" },
      payload,
      key,
    );

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
