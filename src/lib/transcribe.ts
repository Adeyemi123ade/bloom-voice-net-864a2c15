import { supabase } from "@/integrations/supabase/client";
import { parseChatMediaPath } from "@/lib/signedMedia";

/**
 * Voice to text through the transcribe-voice function, with the time each
 * stage took written to the console ("[transcribe] …") so a slow step can be
 * seen on a real phone. Text already worked out for a voice note is kept for
 * this session, so opening it again is instant.
 */
const done = new Map<string, string>();

type Reply = { text?: string; model?: string; timings?: Record<string, number> };

async function call(body: Blob | { path: string }, label: string): Promise<string> {
  const start = performance.now();
  const { data, error } = await supabase.functions.invoke("transcribe-voice", { body });
  if (error) throw error;
  const reply = (data ?? {}) as Reply;
  const total = Math.round(performance.now() - start);
  const server = reply.timings?.total ?? 0;
  console.info(
    `[transcribe] ${label}: ${total} ms on the phone`,
    { model: reply.model, server: reply.timings, network_and_upload: server ? total - server : undefined },
  );
  return (reply.text ?? "").trim();
}

/** A recording made just now (dictating a message). */
export function transcribeRecording(blob: Blob): Promise<string> {
  return call(blob, `recording ${Math.round(blob.size / 1024)} KB`);
}

/**
 * A voice note in the chat. The audio is read next to the storage when the
 * address is a chat-media one; otherwise `download` gets it on the phone.
 */
export async function transcribeVoiceNote(url: string, download: () => Promise<Blob>): Promise<string> {
  const cached = done.get(url);
  if (cached) return cached;
  const path = parseChatMediaPath(url);
  const text = path ? await call({ path }, "voice note (read on the server)") : await call(await download(), "voice note");
  if (text) done.set(url, text);
  return text;
}
