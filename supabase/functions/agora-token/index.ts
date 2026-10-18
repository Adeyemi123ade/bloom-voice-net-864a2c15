// Issues an Agora pass for one in-app call (voice or video).
// Body: { roomName: string } -> { appId, token, uid }
// Same checks as twilio-token: signed in, and one of the two people on the
// call saved under this room name. Dial pad calls stay on Twilio.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { RtcRole, RtcTokenBuilder } from "npm:agora-token@2.0.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Long enough for a long call; the app also renews the pass before it runs out.
const PASS_SECONDS = 4 * 60 * 60;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const appId = Deno.env.get("AGORA_APP_ID")?.trim();
    const certificate = Deno.env.get("AGORA_APP_CERTIFICATE")?.trim();
    if (!appId || !certificate) throw new Error("Agora credentials not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const jwt = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(jwt);
    if (claimsErr || !claimsData?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const userId = claimsData.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const roomName = String(body?.roomName ?? "").trim();
    // Agora channel names must be under 64 bytes.
    if (!roomName || roomName.length >= 64) return json({ error: "Invalid roomName" }, 400);

    // Only the two people on this call may join it (row scoped by RLS too).
    const { data: callRow, error: callErr } = await supabase
      .from("calls")
      .select("caller_id, callee_id")
      .eq("room_name", roomName)
      .maybeSingle();
    if (callErr || !callRow || (callRow.caller_id !== userId && callRow.callee_id !== userId)) {
      return json({ error: "Unauthorized" }, 403);
    }

    const token = RtcTokenBuilder.buildTokenWithUserAccount(
      appId,
      certificate,
      roomName,
      userId,
      RtcRole.PUBLISHER,
      PASS_SECONDS,
      PASS_SECONDS,
    );

    return json({ appId, token, uid: userId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("agora-token error:", msg);
    return json({ error: "Could not start the call" }, 500);
  }
});
