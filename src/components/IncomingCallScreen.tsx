import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Phone, PhoneOff, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type IncomingCall = {
  id: string;
  conversation_id: string;
  caller_id: string;
  room_name: string;
  call_type: "voice" | "video";
};

function initials(name?: string | null) {
  if (!name) return "?";
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

/**
 * Generates a short looping ringtone WAV (two-tone phone ring) as a base64
 * data URL. Built once at module load, then attached to an <audio loop>
 * element. <audio>.play() has a more permissive autoplay policy than
 * AudioContext and works once the user has interacted with the app at least
 * once (which is true by the time a call arrives).
 */
function buildRingtoneDataUrl(): string {
  const sampleRate = 22050;
  const totalSeconds = 3; // 2s ring + 1s silence
  const samples = sampleRate * totalSeconds;
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples * 2, true);

  // Two-tone ring: 440Hz + 480Hz for first 2s, then silence
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    let v = 0;
    if (t < 2) {
      const env = Math.min(1, t * 6) * Math.min(1, (2 - t) * 6);
      v = (Math.sin(2 * Math.PI * 440 * t) + Math.sin(2 * Math.PI * 480 * t)) * 0.25 * env;
    }
    const s = Math.max(-1, Math.min(1, v));
    view.setInt16(44 + i * 2, s * 0x7fff, true);
  }
  // Convert to base64
  const bytes = new Uint8Array(buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `data:audio/wav;base64,${btoa(bin)}`;
}

const RINGTONE_URL = buildRingtoneDataUrl();

/**
 * Shared, persistent audio element. Created once and "primed" by the first
 * user gesture anywhere in the app (click/touch/keydown). Priming = playing
 * a muted no-op so the browser marks this <audio> as user-activated. After
 * that, we can call .play() programmatically (e.g. when an incoming call
 * arrives) without a fresh user gesture — which is exactly how a real phone
 * ringtone behaves.
 */
let sharedAudio: HTMLAudioElement | null = null;
let primed = false;

function getSharedAudio(): HTMLAudioElement {
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.loop = true;
    sharedAudio.preload = "auto";
    sharedAudio.src = RINGTONE_URL;
  }
  return sharedAudio;
}

if (typeof window !== "undefined") {
  const prime = () => {
    if (primed) return;
    const a = getSharedAudio();
    const prevMuted = a.muted;
    const prevVol = a.volume;
    a.muted = true;
    a.volume = 0;
    a.play()
      .then(() => {
        a.pause();
        a.currentTime = 0;
        a.muted = prevMuted;
        a.volume = prevVol;
        primed = true;
      })
      .catch(() => {
        /* will retry on next gesture */
      });
  };
  const opts = { capture: true, passive: true } as AddEventListenerOptions;
  window.addEventListener("pointerdown", prime, opts);
  window.addEventListener("touchstart", prime, opts);
  window.addEventListener("keydown", prime, opts);
  window.addEventListener("click", prime, opts);
}

/** Plays a looping ringtone + vibration while `active` is true. */
function useRingtone(active: boolean) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const a = getSharedAudio();
    a.muted = false;
    a.volume = 0.9;
    a.currentTime = 0;
    audioRef.current = a;
    a.play().catch(() => {
      /* autoplay still blocked — visual UI + vibration will signal the call */
    });

    let vInt: number | undefined;
    try {
      (navigator as { vibrate?: (p: number | number[]) => boolean }).vibrate?.([
        600, 400, 600, 400, 600, 1500,
      ]);
      vInt = window.setInterval(() => {
        try {
          (navigator as { vibrate?: (p: number | number[]) => boolean }).vibrate?.([
            600, 400, 600, 400, 600, 1500,
          ]);
        } catch {
          /* ignore */
        }
      }, 4000);
    } catch {
      /* ignore */
    }

    return () => {
      try {
        a.pause();
        a.currentTime = 0;
      } catch {
        /* ignore */
      }
      audioRef.current = null;
      if (vInt) window.clearInterval(vInt);
      try {
        (navigator as { vibrate?: (p: number | number[]) => boolean }).vibrate?.(0);
      } catch {
        /* ignore */
      }
    };
  }, [active]);
}

/**
 * Listens globally for incoming calls. When one arrives, renders a full-screen
 * accept/decline UI with a ringtone.
 */
export default function IncomingCallScreen() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [callerName, setCallerName] = useState<string | null>(null);
  const [callerAvatar, setCallerAvatar] = useState<string | null>(null);
  const handled = useRef<Set<string>>(new Set());

  useRingtone(!!incoming);

  const incomingRef = useRef<IncomingCall | null>(null);
  useEffect(() => {
    incomingRef.current = incoming;
  }, [incoming]);

  useEffect(() => {
    if (!user) return;

    const handle = async (callId: string) => {
      if (handled.current.has(callId)) return;
      handled.current.add(callId);

      const { data: call } = await supabase
        .from("calls")
        .select("id, conversation_id, caller_id, room_name, call_type, status, callee_id")
        .eq("id", callId)
        .maybeSingle();
      if (!call) return;
      if (call.callee_id !== user.id) return;
      if (call.status !== "ringing") return;

      const { data: prof } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", call.caller_id)
        .maybeSingle();
      setCallerName(prof?.display_name ?? "Unknown");
      setCallerAvatar(prof?.avatar_url ?? null);
      setIncoming({
        id: call.id,
        conversation_id: call.conversation_id,
        caller_id: call.caller_id,
        room_name: call.room_name,
        call_type: call.call_type as "voice" | "video",
      });
    };

    // 1) Catch any ringing call that already exists (e.g. user just logged in
    //    or page reloaded while a call was already incoming).
    (async () => {
      const { data } = await supabase
        .from("calls")
        .select("id")
        .eq("callee_id", user.id)
        .eq("status", "ringing")
        .order("created_at", { ascending: false })
        .limit(1);
      const id = data?.[0]?.id;
      if (id) handle(id);
    })();

    // 2) Subscribe to live INSERTs targeted at this user.
    const ch = supabase
      .channel(`incoming-calls-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "calls",
          filter: `callee_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as { id: string; status: string };
          if (row?.status === "ringing") handle(row.id);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "calls",
        },
        (payload) => {
          const row = payload.new as { id: string; status: string };
          const cur = incomingRef.current;
          if (cur && row?.id === cur.id && row.status !== "ringing") {
            setIncoming(null);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [user]);

  if (!incoming) return null;

  const accept = () => {
    const c = incoming;
    setIncoming(null);
    navigate(
      `/call/${c.conversation_id}?type=${c.call_type}&callId=${c.id}&room=${encodeURIComponent(
        c.room_name,
      )}&role=callee`,
    );
  };

  const decline = async () => {
    const c = incoming;
    setIncoming(null);
    await supabase
      .from("calls")
      .update({ status: "declined", ended_at: new Date().toISOString() })
      .eq("id", c.id);
  };

  const isVideo = incoming.call_type === "video";

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-b from-secondary to-background flex flex-col items-center justify-between py-16 px-6">
      <div className="flex flex-col items-center gap-3 mt-8">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          Incoming {isVideo ? "video" : "voice"} call
        </p>
        <Avatar className="w-28 h-28 ring-4 ring-primary/30">
          <AvatarImage src={callerAvatar ?? undefined} />
          <AvatarFallback className="bg-primary/20 text-foreground text-2xl font-semibold">
            {initials(callerName)}
          </AvatarFallback>
        </Avatar>
        <h2 className="text-2xl font-bold text-foreground mt-4">{callerName ?? "Unknown"}</h2>
        <p className="text-sm text-muted-foreground animate-pulse">Ringing…</p>
      </div>

      <div className="flex items-center justify-around w-full max-w-xs">
        <button
          onClick={decline}
          aria-label="Decline call"
          className="flex flex-col items-center gap-2"
        >
          <span className="w-16 h-16 rounded-full bg-destructive hover:bg-destructive/90 flex items-center justify-center shadow-lg">
            <PhoneOff className="w-7 h-7 text-destructive-foreground" />
          </span>
          <span className="text-xs text-foreground">Decline</span>
        </button>
        <button
          onClick={accept}
          aria-label="Accept call"
          className="flex flex-col items-center gap-2"
        >
          <span className="w-16 h-16 rounded-full bg-primary hover:bg-primary/90 flex items-center justify-center shadow-lg animate-pulse">
            {isVideo ? (
              <Video className="w-7 h-7 text-primary-foreground" />
            ) : (
              <Phone className="w-7 h-7 text-primary-foreground" />
            )}
          </span>
          <span className="text-xs text-foreground">Accept</span>
        </button>
      </div>
    </div>
  );
}
