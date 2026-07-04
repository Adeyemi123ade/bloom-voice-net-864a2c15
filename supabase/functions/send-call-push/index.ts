// Send a high-priority FCM data push to wake the callee's device when an
// app-to-app call starts. Caller invokes this right after inserting a row
// into `calls`. Uses FCM v1 with a Firebase service-account JSON.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: userData } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { calleeId, callId, callType, callerName, conversationId, roomName } = await req.json();
    if (!calleeId || !callId) {
      return new Response(JSON.stringify({ error: "missing fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // This client uses the service role, so RLS doesn't apply here — verify
    // ownership explicitly. Without this, any authenticated user could push
    // a spoofed "incoming call" (arbitrary callerName/callType) to any other
    // user's device just by knowing their user id.
    const { data: callRow, error: callErr } = await supabase
      .from("calls")
      .select("caller_id, callee_id")
      .eq("id", callId)
      .maybeSingle();
    if (
      callErr ||
      !callRow ||
      callRow.caller_id !== userData.user.id ||
      callRow.callee_id !== calleeId
    ) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
    const actionUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/call-action`;

    const { data: tokens } = await supabase
      .from("device_push_tokens")
      .select("fcm_token")
      .eq("user_id", calleeId);

    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, sent: 0, reason: "no tokens" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const saRaw = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
    if (!saRaw) {
      return new Response(
        JSON.stringify({ error: "FCM_SERVICE_ACCOUNT_JSON not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const sa: ServiceAccount = JSON.parse(saRaw);
    const accessToken = await getAccessToken(sa);

    const sendUrl = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
    const results = await Promise.allSettled(
      tokens.map(async (t) => {
        const body = {
          message: {
            token: t.fcm_token,
            // Data-only payload + high priority → wakes Android even when
            // the app is killed. The app's push listener / realtime
            // subscription on `calls` then opens IncomingCallScreen.
            data: {
              type: "incoming_call",
              callId: String(callId),
              calleeId: String(calleeId),
              callType: String(callType ?? "voice"),
              callerName: String(callerName ?? "Someone"),
              conversationId: String(conversationId ?? ""),
              roomName: String(roomName ?? ""),
              actionUrl,
              actionToken,
            },
            android: {
              priority: "HIGH",
              ttl: "30s",
            },
          },
        };
        const r = await fetch(sendUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        if (!r.ok) {
          const txt = await r.text();
          // Stale token cleanup
          if (r.status === 404 || r.status === 400) {
            await supabase
              .from("device_push_tokens")
              .delete()
              .eq("fcm_token", t.fcm_token);
          }
          throw new Error(`fcm ${r.status} ${txt}`);
        }
      }),
    );

    const sent = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - sent;
    return new Response(JSON.stringify({ ok: true, sent, failed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-call-push error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
