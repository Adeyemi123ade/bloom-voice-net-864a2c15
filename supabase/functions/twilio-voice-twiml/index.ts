// TwiML endpoint hit by Twilio when the Voice SDK places an outbound call.
// Configure your TwiML App's Voice Request URL to:
//   https://<project-ref>.supabase.co/functions/v1/twilio-voice-twiml
// Method: POST
//
// The Voice SDK sends a custom "To" parameter (the destination PSTN number).
// We respond with TwiML that dials that number from your Twilio caller ID.
//
// SECURITY: this endpoint is public (verify_jwt = false, since Twilio's own
// webhook caller never sends a Supabase JWT). Without verifying the request
// actually came from Twilio, anyone who finds this URL could POST an
// arbitrary "To" number and get back live TwiML that dials it from your
// Twilio account on someone else's behalf — a toll-fraud vector. We verify
// the standard Twilio X-Twilio-Signature header before trusting anything in
// the request.
//
// REQUIRED before deploying this fix: set the TWILIO_AUTH_TOKEN secret
// (Twilio Console → Account → Auth Token) via
//   supabase secrets set TWILIO_AUTH_TOKEN=xxxx
// If it is not set, this function fails closed (rejects all requests) rather
// than silently skipping verification — so outbound calling will break until
// the secret is configured. Optionally set TWILIO_VOICE_TWIML_URL to the
// exact webhook URL configured in the Twilio Console if this function ever
// runs behind a proxy that rewrites the path seen by `req.url`.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { beginPaidCall, isAllowedNumber, normaliseNumber } from "../_shared/paidCallRules.ts";

// Paid-call limits: only allowed countries (checked here), then the
// person's plan, dial pad switch, new account wait, one call at a time,
// daily minutes and balance, checked and recorded in one database step
// (paid_call_begin). Twilio reports the real length back to this function
// (the <Dial action> below) when the call ends.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

function escapeXml(s: string) {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!,
  );
}

function sayAndHangUp(text: string): Response {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${escapeXml(text)}</Say><Hangup/></Response>`,
    { headers: { "Content-Type": "text/xml" }, status: 200 },
  );
}

/** The address Twilio should call back, without any query string. */
function baseUrl(req: Request): string {
  const configured = Deno.env.get("TWILIO_VOICE_TWIML_URL")?.trim();
  if (configured) return configured;
  const u = new URL(req.url);
  return `${u.origin}${u.pathname}`;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

// Twilio's request-signing algorithm: Base64(HMAC-SHA1(authToken, url + sorted POST params)).
// https://www.twilio.com/docs/usage/security#validating-requests
async function isValidTwilioRequest(
  req: Request,
  authToken: string,
  params: Record<string, string>,
): Promise<boolean> {
  const signature = req.headers.get("X-Twilio-Signature");
  if (!signature) return false;

  // Twilio signs the exact URL it called, query string included (the end of
  // call report below carries ?event=done&id=...).
  const configured = Deno.env.get("TWILIO_VOICE_TWIML_URL")?.trim();
  const url = configured ? configured + new URL(req.url).search : req.url;

  let data = url;
  for (const key of Object.keys(params).sort()) {
    data += key + params[key];
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

  return timingSafeEqual(expected, signature);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const callerId = Deno.env.get("TWILIO_PHONE_NUMBER")?.trim();
    if (!callerId) {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Caller ID not configured.</Say></Response>`,
        { headers: { "Content-Type": "text/xml" }, status: 200 },
      );
    }

    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN")?.trim();
    if (!authToken) {
      console.error("twilio-voice-twiml: TWILIO_AUTH_TOKEN not configured, rejecting request");
      return new Response("Server misconfigured", { status: 500 });
    }

    const ct = req.headers.get("content-type") ?? "";
    if (!ct.includes("application/x-www-form-urlencoded")) {
      return new Response("Unsupported content type", { status: 400 });
    }

    const form = await req.formData();
    const params: Record<string, string> = {};
    for (const [k, v] of form.entries()) params[k] = String(v);

    if (!(await isValidTwilioRequest(req, authToken, params))) {
      console.error("twilio-voice-twiml: invalid X-Twilio-Signature, rejecting request");
      return new Response("Invalid signature", { status: 403 });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const query = new URL(req.url).searchParams;

    // End-of-call report from <Dial action>: store the real length.
    if (query.get("event") === "done") {
      const id = query.get("id");
      const duration = Number.parseInt(params["DialCallDuration"] ?? "0", 10);
      if (id) {
        const { error } = await admin
          .from("outbound_calls")
          .update({
            duration_seconds: Number.isFinite(duration) ? Math.max(0, duration) : 0,
            ended_at: new Date().toISOString(),
            status: params["DialCallStatus"] ?? null,
          })
          .eq("id", id);
        if (error) console.error("twilio-voice-twiml: could not save call length", error.message);
      }
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`,
        { headers: { "Content-Type": "text/xml" }, status: 200 },
      );
    }

    // Who is calling: the Voice SDK sends "client:<identity>", and the
    // identity is the user id put in the token by twilio-voice-token.
    const from = params["From"] ?? params["Caller"] ?? "";
    const userId = from.startsWith("client:") ? from.slice("client:".length) : "";
    if (!/^[0-9a-f-]{36}$/i.test(userId)) {
      console.error("twilio-voice-twiml: unknown caller", from);
      return sayAndHangUp("This call cannot be made.");
    }

    const to = normaliseNumber(params["To"] ?? "");
    if (!isAllowedNumber(to)) {
      return sayAndHangUp("Calls to this number are not available.");
    }

    const decision = await beginPaidCall(admin, userId, to, params["CallSid"] ?? null);
    if (!decision.allowed) {
      switch (decision.reason) {
        case "too_new":
          return sayAndHangUp("Phone calls are available 24 hours after you join ChiChat.");
        case "daily_limit":
          return sayAndHangUp("You have used today's phone call minutes. Please try again tomorrow.");
        case "no_balance":
          return sayAndHangUp("You have no phone call minutes left.");
        case "busy":
          return sayAndHangUp("You are already on a phone call.");
        case "error":
          // Fail closed: if the call can't be counted, it isn't placed.
          return sayAndHangUp("This call cannot be made right now. Please try again.");
        default:
          return sayAndHangUp("This call can't be made.");
      }
    }
    const limit = decision.seconds;
    const row = { id: decision.id as string };

    const action = `${baseUrl(req)}?event=done&id=${encodeURIComponent(row.id)}`;
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${escapeXml(callerId)}" answerOnBridge="true" timeLimit="${limit}" action="${escapeXml(action)}" method="POST">
    <Number>${escapeXml(to)}</Number>
  </Dial>
</Response>`;

    return new Response(twiml, {
      headers: { "Content-Type": "text/xml" },
      status: 200,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    console.error("twilio-voice-twiml error:", msg);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Server error.</Say></Response>`,
      { headers: { "Content-Type": "text/xml" }, status: 200 },
    );
  }
});
