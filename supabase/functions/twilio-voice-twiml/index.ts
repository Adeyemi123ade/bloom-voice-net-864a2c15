// TwiML endpoint hit by Twilio when the Voice SDK places an outbound call.
// Configure your TwiML App's Voice Request URL to:
//   https://<project-ref>.supabase.co/functions/v1/twilio-voice-twiml
// Method: POST
//
// The Voice SDK sends a custom "To" parameter (the destination PSTN number).
// We respond with TwiML that dials that number from your Twilio caller ID.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

function escapeXml(s: string) {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!,
  );
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

    let to = "";
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/x-www-form-urlencoded")) {
      const form = await req.formData();
      to = String(form.get("To") ?? "").trim();
    } else {
      const url = new URL(req.url);
      to = url.searchParams.get("To") ?? "";
    }

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
