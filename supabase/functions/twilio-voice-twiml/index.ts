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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

function escapeXml(s: string) {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!,
  );
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

  const url = Deno.env.get("TWILIO_VOICE_TWIML_URL")?.trim() || req.url;

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

    const to = (params["To"] ?? "").trim();

    if (!to) {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>No destination provided.</Say></Response>`,
        { headers: { "Content-Type": "text/xml" } },
      );
    }

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${escapeXml(callerId)}" answerOnBridge="true">
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
