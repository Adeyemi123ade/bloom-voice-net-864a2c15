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

/** Generates a phone-like ringtone using the Web Audio API (no asset needed). */
function useRingtone(active: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    const ctx = new Ctx();
    ctxRef.current = ctx;

    const playPair = (startAt: number) => {
      [0, 0.4].forEach((offset) => {
        const o1 = ctx.createOscillator();
        const o2 = ctx.createOscillator();
        const g = ctx.createGain();
        o1.frequency.value = 440;
        o2.frequency.value = 480;
        o1.connect(g);
        o2.connect(g);
        g.connect(ctx.destination);
        const t = startAt + offset;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.18, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
        o1.start(t);
        o2.start(t);
        o1.stop(t + 0.35);
        o2.stop(t + 0.35);
      });
    };

    let cycle = 0;
    const tick = () => {
      if (cancelled) return;
      const now = ctx.currentTime + 0.05;
      playPair(now);
      cycle += 1;
      window.setTimeout(tick, 2400);
    };
    tick();

    // Vibration pattern (Android)
    try {
      (navigator as any).vibrate?.([600, 400, 600, 400, 600, 1500]);
      const vInt = window.setInterval(() => {
        try {
          (navigator as any).vibrate?.([600, 400, 600, 400, 600, 1500]);
        } catch {}
      }, 4000);
      stopRef.current = () => {
        window.clearInterval(vInt);
        try {
          (navigator as any).vibrate?.(0);
        } catch {}
      };
    } catch {}

    return () => {
      cancelled = true;
      stopRef.current?.();
      try {
        ctx.close();
      } catch {}
    };
  }, [active]);
}

/**
 * Listens globally for incoming calls. When one arrives, renders a full-screen
 * accept/decline UI with a ringtone. Replaces the previous toast UX.
 */
export default function IncomingCallScreen() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [callerName, setCallerName] = useState<string | null>(null);
  const [callerAvatar, setCallerAvatar] = useState<string | null>(null);
  const handled = useRef<Set<string>>(new Set());

  useRingtone(!!incoming);

  useEffect(() => {
    if (!user) return;

    const handle = async (callId: string) => {
      if (handled.current.has(callId)) return;
      handled.current.add(callId);

      const { data: call } = await supabase
        .from("calls")
        .select("id, conversation_id, caller_id, room_name, call_type, status")
        .eq("id", callId)
        .maybeSingle();
      if (!call || call.status !== "ringing") return;

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

    const ch = supabase
      .channel(`calls-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "calls",
          filter: `callee_id=eq.${user.id}`,
        },
        (payload) => {
          const row: any = payload.new;
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
          const row: any = payload.new;
          // If caller cancels (ends before pickup), dismiss this UI.
          if (incoming && row?.id === incoming.id && row.status !== "ringing") {
            setIncoming(null);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, incoming]);

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
