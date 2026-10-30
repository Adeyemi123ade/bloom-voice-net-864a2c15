// Mints a Twilio Voice SDK access token bound to a TwiML App for outbound PSTN calls.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { checkPaidCall } from "../_shared/paidCallRules.ts";

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
    const TWIML_APP_SID = Deno.env.get("TWILIO_TWIML_APP_SID")?.trim();
    if (!ACCOUNT_SID || !API_KEY_SID || !API_KEY_SECRET || !TWIML_APP_SID) {
      throw new Error("Twilio Voice credentials not configured");
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
    const jwt = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(jwt);
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    // Paid-call limits, checked before a call can start. twilio-voice-twiml
    // checks them again (it's the only place a number is dialled), so these
    // checks are about telling the person clearly, not the last line of
    // defence. Answered with 200 + `blocked` so the app can read the reason.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    // Plan, dial pad switch, new account wait, one call at a time, daily
    // minutes and balance: all decided by the database (paid_call_check).
    const decision = await checkPaidCall(admin, userId);
    if (!decision.allowed) {
      return new Response(
        JSON.stringify({ blocked: decision.reason, daily_minutes: decision.dailyMinutes ?? null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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
        voice: {
          incoming: { allow: true },
          outgoing: { application_sid: TWIML_APP_SID },
        },
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
    console.error("twilio-voice-token error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
