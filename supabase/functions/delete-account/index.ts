// Edge function: delete-account
// Permanently removes the authenticated user and EVERY trace of them from the
// backend so the same email is immediately available for a fresh registration.
//
// Coverage (each step is best-effort but errors are collected and reported):
//   • App data this user owns (profile, backups, push tokens, google tokens, invites)
//   • Conversation footprint (messages they sent, participation rows, typing rows)
//   • Calls where they were caller OR callee, plus call_stats either side
//   • Device binding tables (user_devices, device_login_challenges)
//   • Email-side records keyed by their email (auth_otp_aliases,
//     email_send_log, email_unsubscribe_tokens, suppressed_emails)
//   • Finally the auth.users row itself, which frees the email for re-signup.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
      return new Response(JSON.stringify({ error: "missing_authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.slice("Bearer ".length);

    const userClient = createClient(SUPABASE_URL, ANON_KEY);
    const { data: claimsRes, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsRes?.claims?.sub) {
      return new Response(JSON.stringify({ error: "invalid_session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsRes.claims.sub as string;
    const userEmail = ((claimsRes.claims.email as string | undefined) ?? "")
      .trim()
      .toLowerCase();

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Track failures so we can refuse to "succeed" silently when something
    // critical (like the auth user delete) didn't actually happen.
    const failures: string[] = [];
    const safe = async (label: string, p: PromiseLike<{ error: unknown } | unknown>) => {
      try {
        const res = (await p) as { error?: { message?: string } } | undefined;
        if (res && res.error) failures.push(`${label}: ${res.error.message ?? "unknown"}`);
      } catch (e) {
        failures.push(`${label}: ${(e as Error).message ?? String(e)}`);
      }
    };

    // ── App data owned by this user ───────────────────────────────────────
    await safe("chat_backups", admin.from("chat_backups").delete().eq("user_id", userId));
    await safe("device_push_tokens", admin.from("device_push_tokens").delete().eq("user_id", userId));
    await safe("google_oauth_tokens", admin.from("google_oauth_tokens").delete().eq("user_id", userId));
    await safe("invites", admin.from("invites").delete().eq("inviter_id", userId));

    // ── Conversation footprint ────────────────────────────────────────────
    await safe("typing_indicators", admin.from("typing_indicators").delete().eq("user_id", userId));
    await safe("messages_sent", admin.from("messages").delete().eq("sender_id", userId));
    await safe("conversation_participants", admin.from("conversation_participants").delete().eq("user_id", userId));

    // ── Calls + stats on either side ──────────────────────────────────────
    await safe("call_stats_caller", admin.from("call_stats").delete().eq("caller_id", userId));
    await safe("call_stats_callee", admin.from("call_stats").delete().eq("callee_id", userId));
    await safe("calls_caller", admin.from("calls").delete().eq("caller_id", userId));
    await safe("calls_callee", admin.from("calls").delete().eq("callee_id", userId));

    // ── Device binding & login challenges (this is what makes the email
    //    feel "stuck" on a phone after deletion if not cleared) ───────────
    await safe("user_devices", admin.from("user_devices").delete().eq("user_id", userId));
    await safe("device_login_challenges_uid", admin.from("device_login_challenges").delete().eq("user_id", userId));
    if (userEmail) {
      await safe(
        "device_login_challenges_email",
        admin.from("device_login_challenges").delete().eq("email", userEmail),
      );
    }

    // ── Email-side records keyed by email address ─────────────────────────
    if (userEmail) {
      await safe("auth_otp_aliases", admin.from("auth_otp_aliases").delete().eq("email", userEmail));
      await safe("email_send_log", admin.from("email_send_log").delete().eq("recipient_email", userEmail));
      await safe("email_unsubscribe_tokens", admin.from("email_unsubscribe_tokens").delete().eq("email", userEmail));
      await safe("suppressed_emails", admin.from("suppressed_emails").delete().eq("email", userEmail));
    }

    // ── Profile last so app-side FKs / lookups are gone first ─────────────
    await safe("profiles", admin.from("profiles").delete().eq("id", userId));

    // ── Finally: the auth user itself. THIS frees the email for re-signup.
    //    If this fails we MUST tell the caller — silent success here would
    //    leave the email "already in use" forever from the user's POV.
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) {
      return new Response(
        JSON.stringify({
          error: "auth_user_delete_failed",
          detail: delErr.message,
          partial_failures: failures,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Remember this email was deleted so future sign-in attempts can show
    // "this account was deleted" instead of a generic "no account found".
    if (userEmail) {
      await safe(
        "deleted_accounts_log",
        admin.from("deleted_accounts").insert({ email: userEmail }),
      );
    }

    return new Response(
      JSON.stringify({ ok: true, partial_failures: failures }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: "unexpected", detail: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
