// Stores a report about a person (and optionally one of their messages) and
// emails it to the ChiChat support inbox.
//
// Secrets: RESEND_API_KEY (already set for email). Optional REPORTS_TO
// (default techpath411@gmail.com) and REPORTS_FROM (default
// "ChiChat <noreply@chichatapp.com>").
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { originOfRequest } from "../_shared/requestOrigin.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const REASONS: Record<string, string> = {
  spam: "Spam",
  harassment: "Harassment or bullying",
  inappropriate: "Inappropriate or sexual content",
  scam: "Scam or fake account",
  violence: "Threats or violence",
  other: "Something else",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    const reporterId = claims?.claims?.sub as string | undefined;
    if (claimsErr || !reporterId) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (!(await checkRateLimit(admin, "submit-report", reporterId, 20, 3600))) {
      return json({ error: "too_many" }, 429);
    }

    const body = await req.json().catch(() => ({}));
    const reportedUserId = String(body.reportedUserId ?? "");
    const conversationId = body.conversationId ? String(body.conversationId) : null;
    const messageId = body.messageId ? String(body.messageId) : null;
    const reason = String(body.reason ?? "");
    const details = typeof body.details === "string" ? body.details.slice(0, 1000).trim() : "";
    const alsoBlocked = body.alsoBlocked === true;

    if (!UUID.test(reportedUserId) || reportedUserId === reporterId) return json({ error: "bad_request" }, 400);
    if (!REASONS[reason]) return json({ error: "bad_request" }, 400);
    if (conversationId && !UUID.test(conversationId)) return json({ error: "bad_request" }, 400);
    if (messageId && !UUID.test(messageId)) return json({ error: "bad_request" }, 400);

    // The reporter must share the chat with the person they report.
    if (conversationId) {
      const { data: parts } = await admin
        .from("conversation_participants")
        .select("user_id")
        .eq("conversation_id", conversationId);
      const ids = (parts ?? []).map((p: { user_id: string }) => p.user_id);
      if (!ids.includes(reporterId) || !ids.includes(reportedUserId)) {
        return json({ error: "not_allowed" }, 403);
      }
    }

    // Snapshot of the reported message, taken by the server so it can't be
    // edited away or faked by the reporter.
    let snapshot: Record<string, unknown> | null = null;
    let mediaLink: string | null = null;
    if (messageId) {
      const { data: msg } = await admin
        .from("messages")
        .select("id, conversation_id, sender_id, content, created_at")
        .eq("id", messageId)
        .maybeSingle();
      if (!msg || msg.conversation_id !== conversationId || msg.sender_id !== reportedUserId) {
        return json({ error: "not_allowed" }, 403);
      }
      snapshot = msg;
      const m = String(msg.content ?? "").match(/\/storage\/v1\/object\/(?:public|sign)\/chat-media\/([^?|]+)/);
      if (m) {
        const path = decodeURIComponent(m[1]);
        const { data: signed } = await admin.storage.from("chat-media").createSignedUrl(path, 7 * 24 * 3600);
        mediaLink = signed?.signedUrl ?? null;
      }
    }

    const { data: names } = await admin
      .from("profiles")
      .select("id, display_name")
      .in("id", [reporterId, reportedUserId]);
    const nameOf = (id: string) =>
      (names ?? []).find((n: { id: string }) => n.id === id)?.display_name ?? "(no name)";

    const { data: row, error: insErr } = await admin
      .from("reports")
      .insert({
        reporter_id: reporterId,
        reported_user_id: reportedUserId,
        conversation_id: conversationId,
        message_id: messageId,
        message_snapshot: snapshot,
        reason,
        details: details || null,
        also_blocked: alsoBlocked,
        origin: originOfRequest(req),
      })
      .select("id, created_at")
      .single();
    if (insErr || !row) {
      console.error("submit-report: insert failed", insErr?.message);
      return json({ error: "save_failed" }, 500);
    }

    // Email the support inbox. The report is already saved, so an email
    // failure is logged but still counts as received for the reporter.
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (apiKey) {
      const to = Deno.env.get("REPORTS_TO")?.trim() || "techpath411@gmail.com";
      const from = Deno.env.get("REPORTS_FROM")?.trim() || "ChiChat <noreply@chichatapp.com>";
      const lines: [string, string][] = [
        ["Report ID", row.id],
        ["When", row.created_at],
        ["Reason", REASONS[reason]],
        ["Details", details || "(none)"],
        ["Reported person", `${nameOf(reportedUserId)} (${reportedUserId})`],
        ["Reported by", `${nameOf(reporterId)} (${reporterId})`],
        ["Reporter also blocked them", alsoBlocked ? "Yes" : "No"],
        ["Chat", conversationId ?? "(not from a chat)"],
      ];
      if (snapshot) {
        lines.push(["Message sent at", String(snapshot.created_at)]);
        lines.push(["Message", String(snapshot.content).slice(0, 4000)]);
        if (mediaLink) lines.push(["Attachment (link works for 7 days)", mediaLink]);
      }
      const text = lines.map(([k, v]) => `${k}: ${v}`).join("\n");
      const html =
        `<h2 style="font-family:sans-serif">New ChiChat report</h2><table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">` +
        lines
          .map(
            ([k, v]) =>
              `<tr><td style="padding:6px 12px 6px 0;color:#555;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;white-space:pre-wrap">${
                v.startsWith("https://") ? `<a href="${esc(v)}">${esc(v)}</a>` : esc(v)
              }</td></tr>`,
          )
          .join("") +
        `</table>`;
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from,
            to,
            subject: `ChiChat report: ${REASONS[reason]} (${nameOf(reportedUserId)})`,
            html,
            text,
          }),
        });
        if (res.ok) {
          await admin.from("reports").update({ emailed_at: new Date().toISOString() }).eq("id", row.id);
        } else {
          console.error("submit-report: email failed", res.status, (await res.text()).slice(0, 300));
        }
      } catch (e) {
        console.error("submit-report: email error", (e as Error).message);
      }
    } else {
      console.error("submit-report: RESEND_API_KEY not set, report saved but not emailed");
    }

    return json({ ok: true });
  } catch (e) {
    console.error("submit-report error", (e as Error).message);
    return json({ error: "server_error" }, 500);
  }
});
