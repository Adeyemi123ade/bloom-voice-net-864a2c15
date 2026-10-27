import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sign(value: string) {
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // decline: the lock-screen Decline button. ringing: the phone's own call
    // screen is showing and ringing (sent by the app's native push handler,
    // which has no signed-in session), so the caller can move from
    // "Calling…" to "Ringing…". Each has its own signed token from the push.
    const { action, callId, calleeId, token, ringingToken } = await req.json();
    if (action === "ringing") {
      if (!callId || !calleeId || !ringingToken) {
        return new Response(JSON.stringify({ error: "missing fields" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (ringingToken !== (await sign(`${callId}:${calleeId}:ringing`))) {
        return new Response(JSON.stringify({ error: "invalid token" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      // Only while it still rings and only the first time: a late or
      // repeated report changes nothing.
      const { error } = await admin
        .from("calls")
        .update({ callee_ringing_at: new Date().toISOString() })
        .eq("id", callId)
        .eq("callee_id", calleeId)
        .eq("status", "ringing")
        .is("callee_ringing_at", null);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (action !== "decline" || !callId || !calleeId || !token) {
      return new Response(JSON.stringify({ error: "missing fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const expected = await sign(`${callId}:${calleeId}:decline`);
    if (token !== expected) {
      console.warn("decline refused: token does not match", callId);
      return new Response(JSON.stringify({ error: "invalid token" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: updated, error } = await supabase
      .from("calls")
      .update({ status: "declined", ended_at: new Date().toISOString() })
      .eq("id", callId)
      .eq("callee_id", calleeId)
      .eq("status", "ringing")
      .select("id");
    if (error) throw error;
    // Shows in the function's Logs: 1 = the caller is told now; 0 = the call
    // had already been answered, ended or timed out.
    console.log("decline", callId, "rows updated:", updated?.length ?? 0);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
