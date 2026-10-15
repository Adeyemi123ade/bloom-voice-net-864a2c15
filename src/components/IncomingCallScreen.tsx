import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Phone, PhoneOff, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "@/hooks/use-toast";
import {
  getCallsSnapshot,
  requestEndCall,
  setCallHeld,
  setWaitingCall,
  useCalls,
} from "@/lib/activeCall";
import { getSelectedRingtone, playRingtone } from "@/lib/ringtones";
import { startNativeCallNotifications } from "@/lib/nativeCallNotifications";
import { registerForCallPush } from "@/lib/fcmRegistration";
import { ensureFullScreenIntentPermission } from "@/lib/nativeCalls";
import { formatCallMediaError, prepareCallMedia } from "@/lib/callMedia";

type IncomingCall = {
  id: string;
  conversation_id: string;
  caller_id: string;
  room_name: string;
  call_type: "voice" | "video";
};

const RING_TIMEOUT_MS = 10_000;

function initials(name?: string | null) {
  if (!name) return "?";
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

let audioPrimed = false;
if (typeof window !== "undefined") {
  const prime = () => {
    if (audioPrimed) return;
    audioPrimed = true;
  };
  const opts = { capture: true, passive: true, once: true } as AddEventListenerOptions;
  window.addEventListener("pointerdown", prime, opts);
  window.addEventListener("touchstart", prime, opts);
  window.addEventListener("keydown", prime, opts);
  window.addEventListener("click", prime, opts);
}

function useRingtone(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const id = getSelectedRingtone();
    const stop = playRingtone(id);

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
        } catch { /* ignore */ }
      }, 4000);
    } catch { /* ignore */ }

    return () => {
      try { stop(); } catch { /* ignore */ }
      if (vInt) window.clearInterval(vInt);
      try {
        (navigator as { vibrate?: (p: number | number[]) => boolean }).vibrate?.(0);
      } catch { /* ignore */ }
    };
  }, [active]);
}

/**
 * Call-waiting tone: two short soft beeps every few seconds, played instead
 * of the ringtone when a call comes in while you're already on a call.
 */
function useCallWaitingTone(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    let ctx: AudioContext | null = null;
    try { ctx = new AC(); } catch { return; }
    const beep = (at: number) => {
      if (!ctx) return;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 440;
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.08, at + 0.02);
      g.gain.setValueAtTime(0.08, at + 0.18);
      g.gain.linearRampToValueAtTime(0, at + 0.2);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(at);
      o.stop(at + 0.22);
    };
    const pattern = () => {
      if (!ctx) return;
      const t = ctx.currentTime + 0.05;
      beep(t);
      beep(t + 0.35);
    };
    pattern();
    const id = window.setInterval(pattern, 3000);
    return () => {
      window.clearInterval(id);
      void ctx?.close().catch(() => {});
    };
  }, [active]);
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function IncomingCallScreen() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [callerName, setCallerName] = useState<string | null>(null);
  const [callerAvatar, setCallerAvatar] = useState<string | null>(null);
  const handled = useRef<Set<string>>(new Set());
  const timeoutRef = useRef<number | null>(null);

  // Already on a call: the new one shows as a small "call waiting" card over
  // the current call (which keeps going), with a soft beep, not the ringtone.
  const { calls } = useCalls();
  const inCall = calls.length > 0;
  const [accepting, setAccepting] = useState(false);
  useRingtone(!!incoming && !inCall);
  useCallWaitingTone(!!incoming && inCall);
  useEffect(() => {
    if (incoming && inCall) {
      setWaitingCall({
        callId: incoming.id,
        name: callerName ?? "Unknown",
        avatarUrl: callerAvatar,
        isVideo: incoming.call_type === "video",
      });
    } else {
      setWaitingCall(null);
    }
  }, [incoming, inCall, callerName, callerAvatar]);
  useEffect(() => () => setWaitingCall(null), []);

  const incomingRef = useRef<IncomingCall | null>(null);
  useEffect(() => { incomingRef.current = incoming; }, [incoming]);

  // Auto-dismiss + mark "missed" if the receiver doesn't answer within 45s.
  // Also poll the call row every 2s as a safety net in case the realtime
  // UPDATE for "ended"/"declined" is missed (e.g. dropped websocket).
  useEffect(() => {
    if (!incoming) {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }
    timeoutRef.current = window.setTimeout(async () => {
      const c = incomingRef.current;
      if (!c) return;
      setIncoming(null);
      try {
        await supabase
          .from("calls")
          .update({ status: "missed", ended_at: new Date().toISOString() })
          .eq("id", c.id)
          .eq("status", "ringing");
      } catch { /* ignore */ }
    }, RING_TIMEOUT_MS);

    const pollId = window.setInterval(async () => {
      const c = incomingRef.current;
      if (!c) return;
      const { data } = await supabase
        .from("calls")
        .select("status")
        .eq("id", c.id)
        .maybeSingle();
      if (data && data.status !== "ringing") {
        setIncoming(null);
      }
    }, 300);

    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      window.clearInterval(pollId);
    };
  }, [incoming]);

  useEffect(() => {
    if (!user) return;

    void startNativeCallNotifications(user.id);
    void registerForCallPush(user.id);
    // Android 14+ requires explicit user grant for full-screen-intent before
    // the OS will wake the screen / show the ringing UI from a locked phone.
    void ensureFullScreenIntentPermission();

    const handle = async (callId: string) => {
      if (handled.current.has(callId)) return;
      handled.current.add(callId);

      const { data: call } = await supabase
        .from("calls")
        .select("id, conversation_id, caller_id, room_name, call_type, status, callee_id, created_at")
        .eq("id", callId)
        .maybeSingle();
      if (!call) return;
      if (call.callee_id !== user.id) return;
      if (call.status !== "ringing") return;
      // If the call was created more than 45s ago, treat as already missed.
      const age = Date.now() - new Date(call.created_at as string).getTime();
      if (age > RING_TIMEOUT_MS) {
        await supabase
          .from("calls")
          .update({ status: "missed", ended_at: new Date().toISOString() })
          .eq("id", call.id)
          .eq("status", "ringing");
        return;
      }

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

    const ch = supabase
      .channel(`incoming-calls-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "calls", filter: `callee_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as { id: string; status: string };
          if (row?.status === "ringing") handle(row.id);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "calls", filter: `callee_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as { id: string; status: string };
          // Any non-ringing transition (caller cancelled, ended, declined, missed, accepted) → dismiss UI.
          if (row?.status && row.status !== "ringing") {
            const cur = incomingRef.current;
            if (cur && row.id === cur.id) setIncoming(null);
            handled.current.add(row.id);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [user]);

  if (!incoming) return null;

  const accept = async () => {
    const c = incoming;
    if (accepting) return;
    // Call waiting: answering while a call is live ends that call first
    // ("End & accept"). If the user put it on Hold first, it stays on hold
    // and this call is added next to it ("Hold & accept").
    const live = getCallsSnapshot().calls.find((x) => !x.held);
    if (live) {
      setAccepting(true);
      requestEndCall(live.callId, { handover: true });
      for (let i = 0; i < 40 && getCallsSnapshot().calls.some((x) => x.callId === live.callId); i++) {
        await wait(100);
      }
      setAccepting(false);
      if (incomingRef.current?.id !== c.id) return; // caller gave up meanwhile
    }
    // Any call left keeps (or goes back) on hold while this one is answered.
    getCallsSnapshot().calls.forEach((x) => setCallHeld(x.callId, true));
    try {
      await prepareCallMedia(c.call_type === "video");
    } catch (error) {
      toast({
        title: "Call permission needed",
        description: formatCallMediaError(error, c.call_type === "video"),
        variant: "destructive",
      });
      return;
    }
    setIncoming(null);
    navigate(
      `/call/${c.conversation_id}?type=${c.call_type}&callId=${c.id}&room=${encodeURIComponent(c.room_name)}&role=callee`,
      { replace: true },
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

  if (inCall) {
    // Quarter-screen card over the ongoing call (which stays full screen).
    return (
      <div
        data-testid="call-waiting-card"
        className="fixed z-[100] left-3 top-[calc(env(safe-area-inset-top)+64px)] w-[46%] max-w-[220px] rounded-2xl bg-card/95 backdrop-blur border border-border shadow-xl p-3 flex flex-col items-center gap-2 text-center"
      >
        <span className="text-2xs uppercase tracking-widest text-muted-foreground inline-flex items-center gap-1">
          Incoming {isVideo ? <Video className="w-3 h-3" /> : <Phone className="w-3 h-3" />}
        </span>
        <div className="call-ring my-2">
          <Avatar className="w-14 h-14 ring-2 ring-primary/30">
            <AvatarImage src={callerAvatar ?? undefined} />
            <AvatarFallback className="bg-primary/20 text-foreground font-semibold">
              {initials(callerName)}
            </AvatarFallback>
          </Avatar>
        </div>
        <p className="text-sm font-semibold text-foreground truncate w-full">{callerName ?? "Unknown"}</p>
        <div className="flex w-full gap-2">
          <button
            onClick={decline}
            disabled={accepting}
            aria-label="Reject call"
            className="flex-1 h-9 rounded-full bg-destructive text-destructive-foreground text-xs font-semibold inline-flex items-center justify-center gap-1 disabled:opacity-50"
          >
            <PhoneOff className="w-3.5 h-3.5" /> Reject
          </button>
          <button
            onClick={accept}
            disabled={accepting}
            aria-label="Accept call"
            className="flex-1 h-9 rounded-full bg-primary text-primary-foreground text-xs font-semibold inline-flex items-center justify-center gap-1 disabled:opacity-50"
          >
            {isVideo ? <Video className="w-3.5 h-3.5" /> : <Phone className="w-3.5 h-3.5" />} Accept
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-b from-secondary to-background flex flex-col items-center justify-between py-16 px-6">
      <div className="flex flex-col items-center gap-3 mt-8">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <span>Calling</span>
          {isVideo ? <Video className="w-3.5 h-3.5" /> : <Phone className="w-3.5 h-3.5" />}
        </div>
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
        <button onClick={decline} aria-label="Decline call" className="flex flex-col items-center gap-2">
          <span className="w-16 h-16 rounded-full bg-destructive hover:bg-destructive/90 flex items-center justify-center shadow-lg">
            <PhoneOff className="w-7 h-7 text-destructive-foreground" />
          </span>
          <span className="text-xs text-foreground">Decline</span>
        </button>
        <button onClick={accept} aria-label="Accept call" className="flex flex-col items-center gap-2">
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
