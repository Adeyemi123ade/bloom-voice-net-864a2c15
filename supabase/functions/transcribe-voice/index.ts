// Transcribes a recorded voice note to text via OpenAI's transcription API.
// Used for two things: (1) dictate-to-text in the composer (no target
// language sent — just the plain transcript in whatever language was
// spoken), and (2) the "Transcribe" button on voice note bubbles, which
// sends X-Target-Language so a received note comes back already translated
// into the reader's own preferred language, not just transcribed as-is.
// Authenticated endpoint only — never exposed to anon callers, since each
// call costs real money.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { checkRateLimit } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-target-language",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Generous for a voice note (minutes of audio), keeps a single request's
// cost and abuse potential bounded.
const MAX_BYTES = 15 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "invalid_request" }, 405);

  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "unauthorized" }, 401);

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) return json({ error: "transcription_unavailable" }, 500);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    // Per-user cap, not per-IP — this is an authenticated endpoint and each
    // call has a real dollar cost, so the limit key is the user, not the ip.
    const withinLimit = await checkRateLimit(admin, "transcribe-voice", user.id, 30, 3600);
    if (!withinLimit) {
      return json({ error: "Too many transcriptions. Please try again in a bit." }, 429);
    }

    const audioBuf = await req.arrayBuffer();
    if (audioBuf.byteLength === 0) return json({ error: "empty_audio" }, 400);
    if (audioBuf.byteLength > MAX_BYTES) return json({ error: "audio_too_large" }, 400);

    const contentType = req.headers.get("content-type") || "audio/webm";
    const form = new FormData();
    form.append("file", new Blob([audioBuf], { type: contentType }), "voice.webm");
    form.append("model", "whisper-1");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: form,
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("OpenAI transcription error:", data);
      return json({ error: "transcription_failed" }, 502);
    }

    let text = String(data.text ?? "").trim();

    // Voice-bubble "Transcribe" sends this to get the result already in the
    // reader's own language, not just transcribed as-is. Always translate
    // when it's present — cheaper and far simpler than trying to detect the
    // spoken language and compare it first, and translating text that's
    // already in the target language is a harmless no-op.
    const targetLanguage = req.headers.get("x-target-language");
    if (targetLanguage && text) {
      const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
      if (anthropicKey) {
        const translated = await translateText(text, targetLanguage, anthropicKey);
        if (translated) text = translated;
      } else {
        // Missing config shouldn't break the whole feature — fall back to
        // the untranslated transcript rather than failing the request.
        console.error("transcribe-voice: ANTHROPIC_API_KEY not configured, skipping translation");
      }
    }

    return json({ text });
  } catch (e) {
    console.error("transcribe-voice error:", e);
    return json({ error: "bad_request" }, 400);
  }
});

async function translateText(text: string, targetLanguage: string, apiKey: string): Promise<string | null> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system:
          `Translate the user's message into the language with ISO 639-1 code "${targetLanguage}". ` +
          "Reply with only the translated text — no quotes, no explanation, no original text.",
        messages: [{ role: "user", content: text }],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("translateText: Anthropic error", data);
      return null;
    }
    const out = data.content?.[0]?.text?.trim();
    return out || null;
  } catch (e) {
    console.error("translateText error:", e);
    return null;
  }
}
