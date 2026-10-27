// High-priority FCM data pushes to the ChiChat Android app (FCM v1, with a
// Firebase service-account JSON). Three kinds, chosen by `action`:
//  - "call" (default): wake the callee's phone to ring for a new call.
//  - "cancel": stop that ringing (caller hung up, no answer, or answered /
//    declined on another device); unanswered calls leave a missed-call notice.
//  - "message": notify the other person in a chat about a new message.
//  - "test": ring the signed-in user's own phone (Call setup check).
// Every action checks the signed-in user is entitled to send it.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const enc = (o: unknown) =>
    btoa(JSON.stringify(o))
      .replace(/=+$/, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  const unsigned = `${enc(header)}.${enc(claim)}`;

  // Import PEM private key
  const pem = sa.private_key.replace(/\\n/g, "\n");
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  const jwt = `${unsigned}.${sigB64}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`oauth ${res.status} ${await res.text()}`);
  const j = await res.json();
  return j.access_token as string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// The service-role client (untyped schema, so `any` is the honest type here).
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

/** Send one data push to every device of a user; drop tokens FCM rejects. */
async function pushToUser(
  supabase: Admin,
  userId: string,
  data: Record<string, string>,
  ttl: string,
  priority: "HIGH" | "NORMAL" = "HIGH",
): Promise<{ sent: number; failed: number; reason?: string; error?: string }> {
  // Only phones still signed in to this account; the database deletes the
  // tokens of phones that signed out, so a signed-out phone never rings.
  let { data: tokens, error: tokensError } = await supabase.rpc("push_tokens_for_user", { _user: userId });
  if (tokensError && (tokensError.code === "PGRST202" || tokensError.code === "42883")) {
    // push_tokens_for_user not in the database yet: every saved token, as
    // before, rather than no call reaching anyone.
    ({ data: tokens, error: tokensError } = await supabase
      .from("device_push_tokens")
      .select("fcm_token")
      .eq("user_id", userId));
  }
  if (tokensError) throw new Error(`push tokens: ${tokensError.message}`);
  if (!tokens || tokens.length === 0) return { sent: 0, failed: 0, reason: "no tokens" };

  const saRaw = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
  if (!saRaw) throw new Error("FCM_SERVICE_ACCOUNT_JSON not configured");
  const sa: ServiceAccount = JSON.parse(saRaw);
  const accessToken = await getAccessToken(sa);
  const sendUrl = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

  const results = await Promise.allSettled(
    tokens.map(async (t: { fcm_token: string }) => {
      const r = await fetch(sendUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        // Data-only + high priority wakes Android even when the app is closed;
        // the app's native push handler decides what to show. Google lowers
        // an app's high-priority pushes when many of them show nothing on
        // screen, which makes later CALLS arrive late or not ring at all; so
        // pushes that show nothing use normal priority (see the callers).
        body: JSON.stringify({
          message: { token: t.fcm_token, data, android: { priority, ttl } },
        }),
      });
      if (!r.ok) {
        const txt = await r.text();
        if (r.status === 404 || r.status === 400) {
          await supabase.from("device_push_tokens").delete().eq("fcm_token", t.fcm_token);
        }
        throw new Error(`fcm ${r.status} ${txt}`);
      }
    }),
  );
  const sent = results.filter((r) => r.status === "fulfilled").length;
  const firstError = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
  return {
    sent,
    failed: results.length - sent,
    ...(firstError ? { error: String(firstError.reason?.message ?? firstError.reason).slice(0, 300) } : {}),
  };
}

async function displayName(supabase: Admin, userId: string): Promise<string> {
  return (await profileOf(supabase, userId)).name;
}

async function profileOf(supabase: Admin, userId: string): Promise<{ name: string; avatarUrl: string }> {
  const { data } = await supabase
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", userId)
    .maybeSingle();
  return {
    name: (data?.display_name as string | undefined) ?? "Someone",
    avatarUrl: (data?.avatar_url as string | undefined) ?? "",
  };
}

/** Notification text for a stored message, never the raw "[voice]…" form. */
function messagePreview(content: string): string {
  if (content.startsWith("[voice]")) return "🎤 Voice note";
  if (content.startsWith("[file]")) {
    const [, mime = "", nameEnc = "", , captionEnc = ""] = content.slice(6).split("|");
    const dec = (v: string) => {
      try { return decodeURIComponent(v); } catch { return v; }
    };
    const caption = dec(captionEnc);
    if (mime.startsWith("image/")) return `📷 ${caption || "Photo"}`;
    if (mime.startsWith("video/")) return `🎥 ${caption || "Video"}`;
    return `📄 ${dec(nameEnc) || "Document"}`;
  }
  let text = content;
  if (text.startsWith("> ")) {
    const nl = text.indexOf("\n");
    if (nl > -1) text = text.slice(nl + 1);
  }
  text = text.trim();
  return text.length > 100 ? `${text.slice(0, 100)}…` : text || "New message";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: userData } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    const me = userData?.user?.id;
    if (!me) return json({ error: "unauthorized" }, 401);

    const body = await req.json();
    const action = body.action ?? "call";

    // This client uses the service role, so RLS doesn't apply here: every
    // action verifies ownership explicitly, so nobody can push a spoofed call
    // or message to another user's phone.

    if (action === "test") {
      // "Send test call" in the app's Call setup check: after a short delay
      // (time to lock the phone), ring the user's OWN phones the way a real
      // call would. Reports exactly what happened, so the app can say why a
      // phone isn't ringing (no push token, FCM not configured, ...).
      const delay = Math.min(Math.max(Number(body.delaySeconds ?? 10), 0), 20);
      await new Promise((r) => setTimeout(r, delay * 1000));
      const me_ = await profileOf(supabase, me);
      const result = await pushToUser(
        supabase,
        me,
        {
          type: "test_call",
          test: "1",
          callId: `test-${Date.now()}`,
          callType: "voice",
          callerName: "ChiChat test call",
          avatarUrl: me_.avatarUrl,
          conversationId: "",
          roomName: "",
        },
        "45s",
      );
      return json({ ok: true, ...result });
    }

    if (action === "cancel") {
      const { callId, reason } = body;
      if (!callId || !["missed", "cancelled", "answered", "declined"].includes(reason)) {
        return json({ error: "missing fields" }, 400);
      }
      const { data: call } = await supabase
        .from("calls")
        .select("caller_id, callee_id, call_type, conversation_id")
        .eq("id", callId)
        .maybeSingle();
      if (!call || (call.caller_id !== me && call.callee_id !== me)) return json({ error: "unauthorized" }, 403);
      const result = await pushToUser(
        supabase,
        call.callee_id as string,
        {
          type: "call_cancelled",
          callId: String(callId),
          reason: String(reason),
          callerName: await displayName(supabase, call.caller_id as string),
          callType: String(call.call_type ?? "voice"),
          conversationId: String(call.conversation_id ?? ""),
        },
        "60s",
        // A phone that is ringing has its screen on, so a normal push
        // arrives at once; and a stop-ringing push shows nothing, so it must
        // not count against the app's high-priority pushes.
        "NORMAL",
      );
      return json({ ok: true, ...result });
    }

    if (action === "message") {
      const { messageId } = body;
      if (!messageId) return json({ error: "missing fields" }, 400);
      const { data: msg } = await supabase
        .from("messages")
        .select("id, conversation_id, sender_id, content, deleted_for_everyone")
        .eq("id", messageId)
        .maybeSingle();
      if (!msg || msg.sender_id !== me) return json({ error: "unauthorized" }, 403);
      const content = (msg.content as string | null) ?? "";
      // Call records are covered by the call pushes (missed-call notice).
      if (msg.deleted_for_everyone || !content || content.startsWith("[call]")) return json({ ok: true, sent: 0 });
      const { data: others } = await supabase
        .from("conversation_participants")
        .select("user_id")
        .eq("conversation_id", msg.conversation_id)
        .neq("user_id", me);
      const senderName = await displayName(supabase, me);
      // People with ChiChat open right now see the message in the app; the
      // push shows nothing there, so it goes as normal priority.
      const ids = (others ?? []).map((o: { user_id: string }) => o.user_id);
      const { data: presence } = ids.length
        ? await supabase.from("profiles").select("id, is_online, last_seen_at").in("id", ids)
        : { data: [] };
      const inApp = new Set<string>(
        (presence ?? [])
          .filter((p: { is_online: boolean | null; last_seen_at: string | null }) =>
            p.is_online === true && !!p.last_seen_at && Date.now() - new Date(p.last_seen_at).getTime() < 90_000)
          .map((p: { id: string }) => p.id),
      );
      let sent = 0;
      for (const o of others ?? []) {
        const r = await pushToUser(
          supabase,
          o.user_id as string,
          {
            type: "message",
            conversationId: String(msg.conversation_id),
            messageId: String(msg.id),
            senderName,
            preview: messagePreview(content),
          },
          "86400s",
          inApp.has(o.user_id as string) ? "NORMAL" : "HIGH",
        );
        sent += r.sent;
      }
      return json({ ok: true, sent });
    }

    // action "call"
    const { calleeId, callId, callType, conversationId, roomName } = body;
    if (!calleeId || !callId) return json({ error: "missing fields" }, 400);
    const { data: callRow, error: callErr } = await supabase
      .from("calls")
      .select("caller_id, callee_id")
      .eq("id", callId)
      .maybeSingle();
    if (callErr || !callRow || callRow.caller_id !== me || callRow.callee_id !== calleeId) {
      return json({ error: "unauthorized" }, 403);
    }

    // Sign a short token so the native "Decline" button can call call-action
    // without needing a full user session on the device.
    const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const hmacKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sigBuf = await crypto.subtle.sign(
      "HMAC",
      hmacKey,
      new TextEncoder().encode(`${callId}:${calleeId}:decline`),
    );
    const actionToken = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
      .replace(/=+$/, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    // Lets the phone report "ringing" the same way, without a session.
    const ringBuf = await crypto.subtle.sign(
      "HMAC",
      hmacKey,
      new TextEncoder().encode(`${callId}:${calleeId}:ringing`),
    );
    const ringingToken = btoa(String.fromCharCode(...new Uint8Array(ringBuf)))
      .replace(/=+$/, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const actionUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/call-action`;

    const caller = await profileOf(supabase, me);
    const result = await pushToUser(
      supabase,
      calleeId,
      {
        type: "incoming_call",
        callId: String(callId),
        calleeId: String(calleeId),
        callType: String(callType ?? "voice"),
        // The caller's own name and photo, looked up here. The app used to
        // send the other person's name, so phones showed the wrong caller.
        callerName: caller.name,
        avatarUrl: caller.avatarUrl,
        conversationId: String(conversationId ?? ""),
        roomName: String(roomName ?? ""),
        actionUrl,
        actionToken,
        ringingToken,
        // Public key Supabase asks for on every function request; without
        // it the lock-screen Decline was refused before reaching call-action.
        actionKey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      },
      "45s",
    );
    return json({ ok: true, ...result });
  } catch (e) {
    console.error("send-call-push error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
