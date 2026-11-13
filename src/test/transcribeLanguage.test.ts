import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } },
}));
vi.mock("@/lib/signedMedia", () => ({
  parseChatMediaPath: (url: string) => (url.startsWith("chat-media/") ? url.slice("chat-media/".length) : null),
}));

import { transcribeRecording, transcribeVoiceNote } from "@/lib/transcribe";

const noDownload = () => Promise.reject(new Error("should not download"));

describe("voice note text follows the reader's language", () => {
  beforeEach(() => invoke.mockReset());

  it("asks for the reader's language and returns the translated text", async () => {
    invoke.mockResolvedValue({ data: { text: "Bawo ni", translated: true }, error: null });
    const r = await transcribeVoiceNote("chat-media/a.webm", noDownload, "yo");
    expect(invoke).toHaveBeenCalledWith(
      "transcribe-voice",
      expect.objectContaining({ body: { path: "a.webm", targetLanguage: "yo" } }),
    );
    expect(r).toEqual({ text: "Bawo ni", translationFailed: false });
  });

  it("keeps separate results per language for the same note", async () => {
    invoke.mockResolvedValueOnce({ data: { text: "Bawo ni" }, error: null });
    invoke.mockResolvedValueOnce({ data: { text: "How are you" }, error: null });
    const yo = await transcribeVoiceNote("chat-media/b.webm", noDownload, "yo");
    const en = await transcribeVoiceNote("chat-media/b.webm", noDownload, "en");
    expect(yo.text).toBe("Bawo ni");
    expect(en.text).toBe("How are you");
    // Asking again in the same language is instant (cached).
    await transcribeVoiceNote("chat-media/b.webm", noDownload, "yo");
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("does not keep a failed translation, so the next tap retries", async () => {
    invoke.mockResolvedValueOnce({ data: { text: "Hello", translationFailed: true }, error: null });
    invoke.mockResolvedValueOnce({ data: { text: "Báwo", translationFailed: false }, error: null });
    const first = await transcribeVoiceNote("chat-media/c.webm", noDownload, "yo");
    expect(first).toEqual({ text: "Hello", translationFailed: true });
    const second = await transcribeVoiceNote("chat-media/c.webm", noDownload, "yo");
    expect(second).toEqual({ text: "Báwo", translationFailed: false });
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("sends the language by header when the note is downloaded on the phone", async () => {
    invoke.mockResolvedValue({ data: { text: "Sannu" }, error: null });
    const blob = new Blob(["x"], { type: "audio/webm" });
    await transcribeVoiceNote("https://elsewhere/x.webm", () => Promise.resolve(blob), "ha");
    expect(invoke).toHaveBeenCalledWith(
      "transcribe-voice",
      expect.objectContaining({ body: blob, headers: { "x-target-language": "ha" } }),
    );
  });

  it("never translates dictation", async () => {
    invoke.mockResolvedValue({ data: { text: "hello there" }, error: null });
    const text = await transcribeRecording(new Blob(["x"], { type: "audio/webm" }));
    expect(text).toBe("hello there");
    expect(invoke.mock.calls[0][1]).not.toHaveProperty("headers");
  });
});
