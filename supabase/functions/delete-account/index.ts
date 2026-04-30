import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.slice("Bearer ".length);

    // Validate JWT (works with the new signing-keys system).
    const userClient = createClient(SUPABASE_URL, ANON_KEY);
    const { data: claimsRes, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsRes?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsRes.claims.sub as string;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Best-effort wipe of every row that belongs to or references this user.
    // We swallow individual errors so one missing table can't block deletion.
    const safe = async (p: Promise<unknown>) => { try { await p; } catch { /* ignore */ } };

    await safe(admin.from("chat_backups").delete().eq("user_id", userId));
    await safe(admin.from("device_push_tokens").delete().eq("user_id", userId));
    await safe(admin.from("google_oauth_tokens").delete().eq("user_id", userId));
    await safe(admin.from("invites").delete().eq("inviter_id", userId));
    await safe(admin.from("typing_indicators").delete().eq("user_id", userId));
    await safe(admin.from("call_stats").delete().eq("caller_id", userId));
    await safe(admin.from("call_stats").delete().eq("callee_id", userId));
    await safe(admin.from("messages").delete().eq("sender_id", userId));
    await safe(admin.from("conversation_participants").delete().eq("user_id", userId));
    await safe(admin.from("calls").delete().eq("caller_id", userId));
    await safe(admin.from("calls").delete().eq("callee_id", userId));
    await safe(admin.from("profiles").delete().eq("id", userId));

    // Finally remove the auth user so the email/phone is freed for re-signup.
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) {
      return new Response(JSON.stringify({ error: "Failed to delete user", detail: delErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
