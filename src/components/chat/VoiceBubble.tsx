import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play, Type } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { fmtDuration } from "@/lib/chat/format";
import { useSignedMediaUrl, getSignedChatMediaUrl } from "@/lib/signedMedia";
import { isVoiceTranscribeEnabled } from "@/lib/transcriptionPrefs";
import { transcribeVoiceNote } from "@/lib/transcribe";
import { useLanguage } from "@/lib/i18n/context";
import { tNow } from "@/lib/i18n/language";


// --- Single-instance audio manager (prevents overlap & playback bugs) ---
type AudioCtl = {
  current: HTMLAudioElement | null;
  id: string | null;
  listeners: Set<() => void>;
};
const audioCtl: AudioCtl = { current: null, id: null, listeners: new Set() };
const notify = () => audioCtl.listeners.forEach((fn) => fn());

function useAudioPlayer(id: string, url: string) {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    audioCtl.listeners.add(fn);
    return () => {
      audioCtl.listeners.delete(fn);
    };
  }, []);
  const playing = audioCtl.id === id && !audioCtl.current?.paused;
  const [dur, setDur] = useState(0);
  const [pos, setPos] = useState(0);
  const probeRef = useRef<HTMLAudioElement | null>(null);

  // probe duration
  useEffect(() => {
    const a = new Audio();
    a.preload = "metadata";
    a.src = url;
    probeRef.current = a;
    const onMeta = () => {
      const d = isFinite(a.duration) ? a.duration : 0;
      setDur(Math.floor(d));
    };
    a.addEventListener("loadedmetadata", onMeta);
    return () => {
      a.removeEventListener("loadedmetadata", onMeta);
      probeRef.current = null;
    };
  }, [url]);

  // sync time updates while this id is playing
  useEffect(() => {
    if (audioCtl.id !== id || !audioCtl.current) return;
    const a = audioCtl.current;
    const upd = () => setPos(Math.floor(a.currentTime));
    a.addEventListener("timeupdate", upd);
    return () => a.removeEventListener("timeupdate", upd);
  }, [id, playing]);

  const toggle = useCallback(() => {
    if (audioCtl.id === id && audioCtl.current) {
      if (audioCtl.current.paused) {
        audioCtl.current.play().catch((e) =>
          toast({ title: tNow("voice.playFailed"), description: e.message, variant: "destructive" }),
        );
      } else {
        audioCtl.current.pause();
      }
      notify();
      return;
    }
    // new track
    if (audioCtl.current) {
      audioCtl.current.pause();
      audioCtl.current.src = "";
    }
    const a = new Audio(url);
    audioCtl.current = a;
    audioCtl.id = id;
    a.onended = () => {
      audioCtl.current = null;
      audioCtl.id = null;
      setPos(0);
      notify();
    };
    a.onerror = () => {
      toast({ title: tNow("voice.audioError"), description: tNow("voice.cantLoad"), variant: "destructive" });
      audioCtl.current = null;
      audioCtl.id = null;
      notify();
    };
    a.play()
      .then(() => notify())
      .catch((e) => {
        toast({ title: tNow("voice.playFailed"), description: e.message, variant: "destructive" });
        audioCtl.current = null;
        audioCtl.id = null;
        notify();
      });
  }, [id, url]);

  return { playing, dur, pos, toggle };
}

export function VoiceBubble({ id, url, mine }: { id: string; url: string; mine: boolean }) {
  const signedUrl = useSignedMediaUrl(url);
  const { playing, dur, pos, toggle } = useAudioPlayer(id, signedUrl);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const { t } = useLanguage();

  const onTranscribe = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (transcript) {
      setShowTranscript((v) => !v);
      return;
    }
    if (!signedUrl || !isVoiceTranscribeEnabled()) return;
    setTranscribing(true);
    try {
      const fetchAudio = async (audioUrl: string) => {
        const res = await fetch(audioUrl);
        if (!res.ok) throw new Error(`signed_url_fetch_failed_${res.status}`);
        return res.blob();
      };
      // Only used when the note isn't in chat storage (read on the server otherwise).
      const download = async () => {
        try {
          return await fetchAudio(signedUrl);
        } catch {
          // The cached signed URL can silently expire while this tab was
          // backgrounded (mobile browsers suspend timers): get a fresh one.
          return fetchAudio(await getSignedChatMediaUrl(url));
        }
      };
      const text = await transcribeVoiceNote(url, download);
      if (!text) {
        toast({
          title: t("voice.cantTranscribe"),
          description: t("voice.noSpeech"),
          variant: "destructive",
        });
        return;
      }
      setTranscript(text);
      setShowTranscript(true);
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      const description = message.startsWith("signed_url_fetch_failed")
        ? t("voice.cantDownload")
        : message || t("auth.tryAgain");
      toast({ title: t("chat.transcribeFailed"), description, variant: "destructive" });
    } finally {
      setTranscribing(false);
    }
  };

  const pct = dur ? (pos / dur) * 100 : 0;
  return (
    <div className="min-w-[140px]">
      <div className="flex items-center gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); toggle(); }}
          className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
            mine ? "bg-primary-foreground/20" : "bg-foreground/10"
          }`}
        >
          {playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
        </button>
        <div className={`flex-1 h-1 rounded-full ${mine ? "bg-primary-foreground/30" : "bg-foreground/20"}`}>
          <div
            className={`h-full rounded-full ${mine ? "bg-primary-foreground" : "bg-foreground"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={`text-[9px] ${mine ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
          {fmtDuration(playing || pos ? pos : dur)}
        </span>
        {isVoiceTranscribeEnabled() && (
          <button
            onClick={onTranscribe}
            disabled={transcribing}
            aria-label={transcript ? t("voice.toggle") : t("voice.transcribe")}
            title={transcript ? t("voice.toggle") : t("voice.transcribe")}
            className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
              mine ? "bg-primary-foreground/20" : "bg-foreground/10"
            }`}
          >
            {transcribing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Type className="w-3 h-3" />
            )}
          </button>
        )}
      </div>
      {showTranscript && transcript && (
        <p
          className={`mt-1.5 text-sm italic leading-snug ${
            mine ? "text-primary-foreground/90" : "text-foreground/90"
          }`}
        >
          {transcript}
        </p>
      )}
    </div>
  );
}
