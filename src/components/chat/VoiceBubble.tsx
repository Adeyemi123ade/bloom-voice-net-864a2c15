import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { fmtDuration } from "@/lib/chat/format";

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
          toast({ title: "Playback failed", description: e.message, variant: "destructive" }),
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
      toast({ title: "Audio error", description: "Could not load voice note", variant: "destructive" });
      audioCtl.current = null;
      audioCtl.id = null;
      notify();
    };
    a.play()
      .then(() => notify())
      .catch((e) => {
        toast({ title: "Playback failed", description: e.message, variant: "destructive" });
        audioCtl.current = null;
        audioCtl.id = null;
        notify();
      });
  }, [id, url]);

  return { playing, dur, pos, toggle };
}

export function VoiceBubble({ id, url, mine }: { id: string; url: string; mine: boolean }) {
  const { playing, dur, pos, toggle } = useAudioPlayer(id, url);
  const pct = dur ? (pos / dur) * 100 : 0;
  return (
    <div className="flex items-center gap-2 min-w-[140px]">
      <button
        onClick={(e) => { e.stopPropagation(); toggle(); }}
        className={`w-7 h-7 rounded-full flex items-center justify-center ${
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
    </div>
  );
}
