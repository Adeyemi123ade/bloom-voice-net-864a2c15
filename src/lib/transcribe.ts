import { supabase } from "@/integrations/supabase/client";
import { parseChatMediaPath } from "@/lib/signedMedia";

/**
 * Voice to text through the transcribe-voice function, with the time each
 * stage took written to the console ("[transcribe] …") so a slow step can be
 * seen on a real phone. Text already worked out for a voice note is kept for
 * this session, so opening it again is instant.
 */
const done = new Map<string, VoiceText>();

/** What a voice note says, in the reader's language when it could be. */
export type VoiceText = {
  text: string;
  /** The reader wanted a translation and it didn't work: `text` is the original. */
  translationFailed: boolean;
};

type Reply = {
  text?: string;
  translationFailed?: boolean;
  model?: string;
  timings?: Record<string, number>;
};

async function call(
  body: Blob | { path: string; targetLanguage?: string },
  label: string,
  targetLanguage?: string,
): Promise<VoiceText> {
  const start = performance.now();
  const { data, error } = await supabase.functions.invoke("transcribe-voice", {
    body,
    // A recording sent as raw audio can't carry the language in its body.
    ...(targetLanguage && body instanceof Blob ? { headers: { "x-target-language": targetLanguage } } : {}),
  });
  if (error) throw error;
  const reply = (data ?? {}) as Reply;
  const total = Math.round(performance.now() - start);
  const server = reply.timings?.total ?? 0;
  console.info(
    `[transcribe] ${label}: ${total} ms on the phone`,
    { model: reply.model, server: reply.timings, network_and_upload: server ? total - server : undefined },
  );
  return { text: (reply.text ?? "").trim(), translationFailed: reply.translationFailed === true };
}

/** A recording made just now (dictating a message). */
export async function transcribeRecording(blob: Blob): Promise<string> {
  // Dictation stays in the language that was spoken: no target language.
  return (await call(blob, `recording ${Math.round(blob.size / 1024)} KB`)).text;
}

/**
 * A voice note in the chat, written out in `language` (the reader's chosen
 * language): translated when it was spoken in another one. The audio is read
 * next to the storage when the address is a chat-media one; otherwise
 * `download` gets it on the phone. A result whose translation failed is not
 * kept, so tapping again tries again.
 */
export async function transcribeVoiceNote(
  url: string,
  download: () => Promise<Blob>,
  language: string,
): Promise<VoiceText> {
  const key = `${language}|${url}`;
  const cached = done.get(key);
  if (cached) return cached;
  const path = parseChatMediaPath(url);
  const result = path
    ? await call({ path, targetLanguage: language }, "voice note (read on the server)", language)
    : await call(await download(), "voice note", language);
  if (result.text && !result.translationFailed) done.set(key, result);
  return result;
}
