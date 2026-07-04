// Manage Twilio Video rooms via REST: create with short timeouts, or complete (close) a room.
// Body: { action: "create" | "complete", roomName: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function basicAuth(sid: string, secret: string) {
  return "Basic " + btoa(`${sid}:${secret}`);
}

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
    const jwt = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(jwt);
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "").trim();
    const roomName = String(body?.roomName ?? "").trim();
    if (!roomName || roomName.length > 128 || (action !== "create" && action !== "complete")) {
      return new Response(JSON.stringify({ error: "Invalid params" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // "complete" ends an existing call's room — without an ownership check,
    // any authenticated user who learns/guesses a room name could kill
    // someone else's active call (DoS). "create" happens *before* the
    // `calls` row exists (the client pre-creates the empty Twilio room, then
    // inserts the `calls` row), so there's nothing to check it against yet —
    // and creating an empty, auto-expiring (1 min) room shell grants no
    // access on its own; real access is gated by twilio-token instead.
    if (action === "complete") {
      // `supabase` above carries the caller's own JWT, so this SELECT is
      // already scoped by the "Participants view own calls" RLS policy.
      const { data: callRow, error: callErr } = await supabase
        .from("calls")
        .select("caller_id, callee_id")
        .eq("room_name", roomName)
        .maybeSingle();
      if (callErr || !callRow || (callRow.caller_id !== userId && callRow.callee_id !== userId)) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const auth = basicAuth(API_KEY_SID, API_KEY_SECRET);

    if (action === "create") {
      // Twilio minimum for both timeouts is 1 minute. Use it to kill ghost rooms fast.
      // Group room (SFU) so EmptyRoomTimeout / UnusedRoomTimeout apply.
      const params = new URLSearchParams({
        UniqueName: roomName,
        Type: "group",
        EmptyRoomTimeout: "1",
        UnusedRoomTimeout: "1",
      });
      const resp = await fetch("https://video.twilio.com/v1/Rooms", {
        method: "POST",
        headers: {
          Authorization: auth,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
      });
      const data = await resp.json();
      // 409 = already exists with that UniqueName, treat as success.
      if (!resp.ok && resp.status !== 409) {
        console.error("Twilio create room failed:", resp.status, data);
        return new Response(JSON.stringify({ error: data?.message ?? "Create room failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true, room: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // action === "complete" -> close room by UniqueName
    const url = `https://video.twilio.com/v1/Rooms/${encodeURIComponent(roomName)}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ Status: "completed" }),
    });
    const data = await resp.json().catch(() => ({}));
    // 404 = room never existed or already gone; treat as success.
    if (!resp.ok && resp.status !== 404) {
      console.error("Twilio complete room failed:", resp.status, data);
      return new Response(JSON.stringify({ error: data?.message ?? "Complete room failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("twilio-room error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
