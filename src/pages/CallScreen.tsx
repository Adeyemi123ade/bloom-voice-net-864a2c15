import { requestAccountCheck } from "@/lib/accountStatus";
import { tNow } from "@/lib/i18n/language";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  createLocalAudioTrack,
  createLocalVideoTrack,
  type LocalAudioTrack,
  type LocalVideoTrack,
  type Room,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteVideoTrack,
} from "twilio-video";
import FloatingCallBubble from "@/components/call/FloatingCallBubble";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useAuth } from "@/hooks/useAuth";
import { useRingback } from "@/hooks/useRingback";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatCallClock } from "@/lib/chat/messageKinds";
import { CALL_RING_TIMEOUT_MS } from "@/lib/callTiming";
import { pushCallCancelled } from "@/lib/pushNotify";
import {
  clearPreparedCallMedia,
  formatCallMediaError,
  startPreparingCallMedia,
  takePreparedCallMedia,
} from "@/lib/callMedia";
import { getCallToken, prefetchCallToken, renewCallToken } from "@/lib/callToken";
import { connectCall, roomNeedsTwilioSetup } from "@/lib/callEngine";
import { markCall, startCallTimeline } from "@/lib/callTimeline";
import { startCallForegroundService, stopCallForegroundService } from "@/lib/nativeCalls";
import {
  FROM_CALL_BUBBLE,
  activeCallPath,
  finishActiveCall,
  getCallsSnapshot,
  minimizeTarget,
  registerEndHandler,
  setCallPeer,
  useCalls,
  type ActiveCallParams,
} from "@/lib/activeCall";
import CallFullScreen from "@/components/call/CallFullScreen";
import { saveNewCall } from "@/lib/callStart";
import { clearLiveCall, liveCallRecord, saveLiveCall, touchLiveCall, type LiveCallRecord } from "@/lib/liveCallRecord";

/**
 * How long a call waits for the other person (or for this phone's own
 * connection) to come back before it counts as lost. A dropped connection,
 * a phone switching networks, or the other app restarting all come back
 * within this; only then is the call ended for both.
 */
const RECONNECT_GRACE_MS = 60_000;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MEDIA_ERRORS = new Set(["NotAllowedError", "NotFoundError", "NotReadableError", "OverconstrainedError", "SecurityError"]);
const isMediaError = (e: unknown) =>
  typeof e === "object" && !!e && MEDIA_ERRORS.has(String((e as { name?: string }).name ?? ""));

type Profile = { id: string; display_name: string | null; avatar_url: string | null };

/**
 * One live call. Rendered by <ActiveCallHost /> above the routes, so it
 * stays mounted (room, camera, mic, status subscription all intact) while
 * the user moves around the app. Full screen on its own /call route, a
 * floating bubble everywhere else. Only unmounts once the call is over.
 */
export default function CallSession({
  params,
  foreground = true,
  held = false,
}: {
  params: ActiveCallParams;
  /** The call on screen. A call in the background is on hold and draws nothing but its audio element. */
  foreground?: boolean;
  /** On hold: the other person can't hear or see you, and you don't hear them. */
  held?: boolean;
}) {
  const { conversationId, callId, roomName, role, initialIsVideo } = params;
  const navigate = useNavigate();
  const location = useLocation();
  const onCallScreen = location.pathname === `/call/${conversationId}`;
  const onCallScreenRef = useRef(onCallScreen);
  onCallScreenRef.current = onCallScreen;
  const { user, loading, signedOut } = useAuth();

  // Picking up a call this phone was already connected to, after the app
  // reloaded or Android restarted it: join it again, don't start or answer it.
  const resumeRef = useRef<LiveCallRecord | null | undefined>(undefined);
  if (resumeRef.current === undefined) resumeRef.current = callId ? liveCallRecord(callId) : null;
  const resume = resumeRef.current;

  const [other, setOther] = useState<Profile | null>(() =>
    params.peer
      ? { id: "", display_name: params.peer.name, avatar_url: params.peer.avatarUrl ?? null }
      : null,
  );
  const [status, setStatus] = useState<"connecting" | "ringing" | "connected" | "ended">(
    resume ? "connecting" : role === "caller" ? "ringing" : "connecting",
  );
  // The connection dropped (or the other person's did) and is coming back.
  // The call is still on: nothing is ended while this shows.
  const [reconnecting, setReconnecting] = useState(false);
  const [isVideo, setIsVideo] = useState(initialIsVideo);
  const [muted, setMuted] = useState(false);
  // The other person put this call on hold (they're on another call).
  const [remoteHeld, setRemoteHeld] = useState(false);
  const heldRef = useRef(held);
  heldRef.current = held;
  // Set when this call is being ended so another call can take the screen:
  // don't navigate away to the chat.
  const handoverRef = useRef(false);
  const callsSnap = useCalls();
  const [videoEnabled, setVideoEnabled] = useState(initialIsVideo);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [canSwitchCamera, setCanSwitchCamera] = useState(false);
  const [seconds, setSeconds] = useState(() =>
    resume ? Math.max(0, Math.floor((Date.now() - resume.connectedAt) / 1000)) : 0,
  );
  const [needsTapForSound, setNeedsTapForSound] = useState(false);
  const [videoSwapped, setVideoSwapped] = useState(false);
  // Tracks rendered by RemoteMedia. Keeping them in state guarantees the
  // child re-attaches whenever a track is added, replaced, or removed.
  const [localVideoTrack, setLocalVideoTrack] = useState<LocalVideoTrack | null>(null);
  const [remoteVideoTrack, setRemoteVideoTrack] = useState<RemoteVideoTrack | null>(null);
  const [upgradeRequest, setUpgradeRequest] = useState<"incoming" | "outgoing" | null>(null);
  const callChannelRef = useRef<RealtimeChannel | null>(null);
  const upgradeTimeoutRef = useRef<number | null>(null);

  const roomRef = useRef<Room | null>(null);
  // Synchronous re-entrancy guard for joinRoom(). roomRef.current is only set
  // after the async token/media/Twilio-connect sequence resolves, which left
  // a window where the realtime "accepted" listener and the 400ms polling
  // fallback could both call joinRoom() for the same call before either had
  // set roomRef — Twilio Video disconnects an earlier connection when a
  // second one arrives with the same participant identity, so the caller's
  // own redundant join could silently kick its own successful one. This flag
  // is set synchronously, before any await, and cleared once the attempt
  // settles (success or failure) — roomRef.current itself is what prevents
  // any further join attempts once actually connected.
  const joiningRef = useRef(false);
  const localAudioRef = useRef<LocalAudioTrack | null>(null);
  const localVideoRef = useRef<LocalVideoTrack | null>(null);
  const remoteAudioEl = useRef<HTMLAudioElement>(null);
  const tickTimer = useRef<number | null>(null);
  const endedRef = useRef(false);
  const handledStatusesRef = useRef<Set<string>>(new Set());
  // Short-lived call notices ("Call connected", "Call ended · 00:29"),
  // shown through the app's normal toast and dismissed automatically.
  const connectedRef = useRef(false);
  const secondsRef = useRef(0);
  secondsRef.current = seconds;
  // Set once a more specific end notice (declined, no answer, failed) has
  // been shown, so the generic "Call ended" doesn't replace it.
  const endNoticeShownRef = useRef(false);
  const callNotice = (title: string, opts: { destructive?: boolean; description?: string } = {}) => {
    toast({
      title,
      description: opts.description,
      duration: 3000,
      ...(opts.destructive ? { variant: "destructive" as const } : {}),
    });
  };
  const endNotice = (title: string, opts: { destructive?: boolean; description?: string } = {}) => {
    endNoticeShownRef.current = true;
    callNotice(title, opts);
  };

  const handleCallStatus = (nextStatus: string) => {
    if (nextStatus === "accepted" && status === "ringing") {
      // Usually the caller is already in the call (joined while ringing):
      // just wait for the other person to arrive. Otherwise join now.
      if (roomRef.current) setStatus("connecting");
      else void joinRoom();
      return;
    }
    if (handledStatusesRef.current.has(nextStatus)) return;
    handledStatusesRef.current.add(nextStatus);

    if (nextStatus === "declined") {
      endNotice(tNow("cs.declined"));
      if (role === "caller") void logCallMessage("rejected", 0);
      cleanupAndExit();
      return;
    }
    if (nextStatus === "missed") {
      if (role === "caller") {
        endNotice(tNow("call.noAnswer"));
        void logCallMessage("no_answer", 0);
      }
      cleanupAndExit();
      return;
    }
    if (nextStatus === "ended") {
      // The other person hung up: the caller records how the call went.
      if (role === "caller") {
        if (connectedRef.current) void logCallMessage("ended", secondsRef.current);
        else void logCallMessage("rejected", 0);
      }
      cleanupAndExit();
    }
  };

  // Caller hears classic phone ringback while waiting for the callee to pick up.
  useRingback(role === "caller" && status === "ringing");

  // Signed out mid-call: end the call. Only a real sign out counts; the
  // sign-in briefly not being readable (slow network at start up) is not one.
  useEffect(() => {
    if (!loading && !user && signedOut) void endCallRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, signedOut]);

  useEffect(() => {
    document.title = `${isVideo ? tNow("call.video") : tNow("call.voice")} — Chichat`;
  }, [isVideo]);

  // Who's on the other end. The screen that started the call passes their
  // name and photo (params.peer) so they show instantly; this lookup fills
  // in or confirms them. It retries, because a single failed or slow lookup
  // used to leave the call screen saying "Contact" with a "?" avatar.
  useEffect(() => {
    if (params.peer) {
      setCallPeer(callId, { name: params.peer.name, avatarUrl: params.peer.avatarUrl ?? null });
    }
    if (!user || !conversationId) return;
    let cancelled = false;
    (async () => {
      for (let attempt = 0; attempt < 5 && !cancelled; attempt++) {
        let otherId: string | null = null;
        // The call row names both people directly.
        if (callId) {
          const { data: call } = await supabase
            .from("calls")
            .select("caller_id, callee_id")
            .eq("id", callId)
            .maybeSingle();
          if (call) otherId = call.caller_id === user.id ? call.callee_id : call.caller_id;
        }
        if (!otherId) {
          const { data: parts } = await supabase
            .from("conversation_participants")
            .select("user_id")
            .eq("conversation_id", conversationId)
            .neq("user_id", user.id);
          otherId = parts?.[0]?.user_id ?? null;
        }
        if (otherId) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("id, display_name, avatar_url")
            .eq("id", otherId)
            .maybeSingle();
          if (prof && !cancelled) {
            setOther(prof as Profile);
            setCallPeer(callId, { name: prof.display_name ?? tNow("chat.contact"), avatarUrl: prof.avatar_url ?? null });
            return;
          }
        }
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, conversationId, callId]);

  useEffect(() => {
    if (!callId) return;
    const ch = supabase
      .channel(`call-${callId}`, { config: { broadcast: { self: false } } })
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "calls", filter: `id=eq.${callId}` },
        (payload) => {
          const row = payload.new as { status: string };
          handleCallStatus(row.status);
        },
      )
      .on("broadcast", { event: "video-upgrade-request" }, () => {
        if (isVideo || endedRef.current) return;
        setUpgradeRequest("incoming");
      })
      .on("broadcast", { event: "video-upgrade-response" }, ({ payload }) => {
        const accepted = !!(payload as { accepted?: boolean })?.accepted;
        if (upgradeTimeoutRef.current) window.clearTimeout(upgradeTimeoutRef.current);
        setUpgradeRequest(null);
        if (accepted) {
          void publishLocalVideo();
        } else {
          toast({ title: tNow("cs.videoDeclined") });
        }
      })
      .on("broadcast", { event: "hold" }, ({ payload }) => {
        setRemoteHeld(!!(payload as { held?: boolean })?.held);
      })
      .on("broadcast", { event: "video-upgrade-cancel" }, () => {
        setUpgradeRequest((curr) => (curr === "incoming" ? null : curr));
      })
      .subscribe((st) => {
        // A channel rebuilt mid-call re-announces that this call is on hold.
        if (st === "SUBSCRIBED" && heldRef.current) {
          void ch.send({ type: "broadcast", event: "hold", payload: { held: true } });
        }
      });
    callChannelRef.current = ch;
    return () => {
      callChannelRef.current = null;
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId, status, role, isVideo]);

  useEffect(() => {
    if (!callId || status === "ended") return;
    const pollId = window.setInterval(async () => {
      const { data } = await supabase
        .from("calls")
        .select("status")
        .eq("id", callId)
        .maybeSingle();
      if (data?.status) handleCallStatus(data.status);
    }, 400);

    return () => window.clearInterval(pollId);
  }, [callId, status, role]);

  // Caller-side 45s ring timeout — if callee doesn't accept, mark as "no answer".
  useEffect(() => {
    if (role !== "caller" || status !== "ringing" || !callId) return;
    const t = window.setTimeout(async () => {
      // Only flip if still ringing in DB.
      await supabase
        .from("calls")
        .update({ status: "missed", ended_at: new Date().toISOString() })
        .eq("id", callId)
        .eq("status", "ringing");
      endNotice(tNow("call.noAnswer"));
      // Stop their phone ringing and leave a missed-call notice on it.
      pushCallCancelled(callId, "missed");
      void logCallMessage("no_answer", 0);
      cleanupAndExit();
    }, CALL_RING_TIMEOUT_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, status, callId]);

  // Both people tapped Call at the same moment: this phone answers the
  // other person's call (already ringing here) instead of making a second one.
  const answerInstead = (ex: { id: string; conversation_id: string; room_name: string; call_type: string }) => {
    if (endedRef.current) return;
    endedRef.current = true;
    clearPreparedCallMedia();
    startPreparingCallMedia(ex.call_type === "video").catch(() => {});
    startCallTimeline(ex.id, "callee");
    finishActiveCall(callId);
    navigate(
      `/call/${ex.conversation_id}?type=${ex.call_type}&callId=${ex.id}&room=${encodeURIComponent(ex.room_name)}&role=callee`,
      { replace: true, state: { peer: params.peer } },
    );
  };

  // ── Outgoing setup ───────────────────────────────────────────────────
  // The call screen opened the moment Call was tapped (lib/callStart). Here,
  // behind it: microphone, saving the call, waking the other phone, the call
  // room and the permission to join all start together, and this phone
  // joins the call while it rings, so answering connects at once.
  const setupStarted = useRef(false);
  useEffect(() => {
    if (role !== "caller" || !params.setup || !user || setupStarted.current || resume) return;
    setupStarted.current = true;
    markCall(callId, "screen");
    const calleeId = params.setup.calleeId;
    let failed = false;
    let saved = false;
    const fail = (title: string, description?: string) => {
      if (failed || endedRef.current) return;
      failed = true;
      endNotice(title, { description, destructive: true });
      if (saved) {
        void supabase
          .from("calls")
          .update({ status: "ended", ended_at: new Date().toISOString() })
          .eq("id", callId)
          .then(() => {});
        pushCallCancelled(callId, "cancelled");
      }
      cleanupAndExit();
    };
    const media = startPreparingCallMedia(initialIsVideo);
    media.then(
      () => markCall(callId, "media"),
      (e) => fail(tNow("cs.permNeeded"), formatCallMediaError(e, initialIsVideo)),
    );
    (async () => {
      const savedCall = await saveNewCall({
        id: callId,
        conversation_id: conversationId,
        caller_id: user.id,
        callee_id: calleeId,
        room_name: roomName,
        call_type: initialIsVideo ? "video" : "voice",
      });
      if (savedCall.result === "existing") {
        const ex = savedCall.call;
        if (ex.status === "ringing" && ex.callee_id === user.id) {
          // They're calling at this very moment: answer their call instead
          // of starting a second one.
          answerInstead(ex);
          return;
        }
        // Already on a call with this person (on this or another phone).
        failed = true;
        endNotice(tNow("cs.alreadyOnCall"));
        cleanupAndExit({ keepRoom: true });
        return;
      }
      if (savedCall.result === "busy") {
        failed = true;
        endNotice(tNow("cs.endCurrent"));
        cleanupAndExit({ keepRoom: true });
        return;
      }
      if (savedCall.result === "blocked") {
        fail(tNow("cs.notAvailable"), tNow("cs.cantCall"));
        return;
      }
      if (savedCall.result === "limited") {
        fail(tNow("cs.notAvailable"), tNow("lim.calls"));
        return;
      }
      if (savedCall.result === "suspended") {
        fail(tNow("cs.notAvailable"), tNow("cs.cantCall"));
        requestAccountCheck();
        return;
      }
      if (savedCall.result === "error") {
        fail(tNow("cs.cantStart"), tNow("chat.checkConnection"));
        return;
      }
      saved = true;
      markCall(callId, "saved");
      // Hung up (or the microphone was refused) while it was saving.
      if (failed || endedRef.current) {
        await supabase
          .from("calls")
          .update({ status: "ended", ended_at: new Date().toISOString() })
          .eq("id", callId);
        return;
      }
      // Wake the other phone (rings even if ChiChat is closed there).
      void supabase.functions
        .invoke("send-call-push", {
          body: { calleeId, callId, callType: initialIsVideo ? "video" : "voice", conversationId, roomName },
        })
        .then(() => markCall(callId, "push"), (e) => console.warn("[call-push] failed", e));
      prefetchCallToken(roomName);
      const room = roomNeedsTwilioSetup(roomName)
        ? supabase.functions
            .invoke("twilio-room", { body: { action: "create", roomName } })
            .then(({ error: roomErr }) => {
              if (roomErr) throw roomErr;
              markCall(callId, "room");
            })
        : Promise.resolve();
      try {
        await media;
      } catch {
        return; // already reported by fail()
      }
      try {
        await room;
      } catch (e) {
        // Joining creates the room anyway on most Twilio setups; try it.
        console.warn("[call] room pre-create failed", e);
      }
      if (!failed && !endedRef.current) void joinRoom({ early: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Back after a reload: join the same call again. Nothing is saved: the
  // call never stopped.
  useEffect(() => {
    if (!resume) return;
    void joinRoom({ resume: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (role !== "callee" || !callId || resume) return;
    markCall(callId, "screen");
    // Start joining straight away, alongside saving "accepted" (it used to
    // wait for that round trip first). If the call turns out to be over,
    // the check below ends it and leaves the room.
    void joinRoom();
    (async () => {
      // Guard on status="ringing" like the caller's timeout does — if the
      // caller's 45s timeout (or a decline/end from elsewhere) already fired
      // right as we tapped Accept, this update affects zero rows. Without the
      // guard we'd flip the row back to "accepted" and join a room the
      // caller has already torn down, with nothing left to detect it.
      const { data } = await supabase
        .from("calls")
        .update({ status: "accepted" })
        .eq("id", callId)
        .eq("status", "ringing")
        .select("id")
        .maybeSingle();
      if (!data) {
        endNotice(tNow("cs.ended"));
        cleanupAndExit();
        return;
      }
      // Answered here: stop any other phone of mine that's still ringing.
      pushCallCancelled(callId, "answered");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, callId]);

  useEffect(() => {
    if (status !== "connected") return;
    tickTimer.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    void startCallForegroundService();
    return () => {
      if (tickTimer.current) window.clearInterval(tickTimer.current);
    };
  }, [status]);

  const completeRoom = async () => {
    if (!roomName || !roomNeedsTwilioSetup(roomName)) return;
    try {
      await supabase.functions.invoke("twilio-room", {
        body: { action: "complete", roomName },
      });
    } catch (e) {
      console.warn("twilio-room complete failed", e);
    }
  };

  /**
   * Close this call on this phone. `keepRoom`: the call room isn't closed
   * (the call was never started, or carries on elsewhere).
   */
  const cleanupAndExit = async (opts: { keepRoom?: boolean } = {}) => {
    if (endedRef.current) return;
    endedRef.current = true;
    setStatus("ended");
    setReconnecting(false);
    stopLostGrace();
    clearLiveCall(callId);
    if (tickTimer.current) window.clearInterval(tickTimer.current);
    try {
      localAudioRef.current?.stop();
      localVideoRef.current?.stop();
      leaveRoom();
      if (remoteAudioEl.current) {
        remoteAudioEl.current.pause();
        remoteAudioEl.current.srcObject = null;
      }
      clearPreparedCallMedia();
      setLocalVideoTrack(null);
      setRemoteVideoTrack(null);
    } catch {
      /* ignore */
    }
    // Close the Twilio room so it can't keep billing as a ghost room.
    if (!opts.keepRoom) void completeRoom();
    // Keep Android's call service running while another call is still on.
    const others = getCallsSnapshot().calls.filter((c) => c.callId !== callId);
    if (others.length === 0) void stopCallForegroundService();
    setTimeout(() => {
      const wasOnScreen = onCallScreenRef.current;
      // Drop this call first, so a call on hold becomes the call on screen
      // (and comes off hold) before anything navigates.
      finishActiveCall(callId);
      const next = getCallsSnapshot().calls.find((c) => c.callId !== callId);
      // Only move the user if they're looking at this call. If another call
      // is taking over the screen (answering a waiting call), it navigates.
      if (wasOnScreen && !handoverRef.current) {
        if (next) navigate(activeCallPath(next), { replace: true });
        else navigate(`/chat/${conversationId}`, { replace: true });
      }
      // Shown wherever the user is now (the chat, or the screen they'd
      // minimised the call to), with the length when the call connected.
      if (!endNoticeShownRef.current) {
        endNoticeShownRef.current = true;
        callNotice(connectedRef.current ? tNow("cs.endedTime", { time: formatCallClock(secondsRef.current) }) : tNow("cs.ended"));
      }
    }, 500);
  };

  /**
   * Call log "kind" semantics (rendered later in CallSystemBubble):
   *  - ended       → connected then hung up by either party (shows duration)
   *  - no_answer   → caller side, callee did not pick up before timeout/cancel
   *  - missed      → receiver side, callee never answered
   *  - rejected    → caller side, callee declined
   *  - declined    → receiver side, callee declined
   *  - received    → receiver side, callee picked up
   */
  /**
   * One call record per call, written by the caller only (both people see
   * it, each from their own side: "Voice call · 3 mins" / "Missed voice
   * call"). Calls used to leave two or three records: "Received call"
   * from the person answering, "Call ended" from whoever hung up, and both
   * a "rejected" and a "declined" for one rejected call.
   */
  const callLogged = useRef(false);
  const logCallMessage = async (
    kind: "ended" | "missed" | "no_answer" | "declined" | "rejected" | "received",
    duration: number,
  ) => {
    if (!user || !conversationId) return;
    if (role !== "caller" || callLogged.current) return;
    callLogged.current = true;
    try {
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: `[call]${isVideo ? "video" : "voice"}|${kind}|${duration}`,
      });
    } catch { /* ignore */ }
  };

  const endCall = async () => {
    // Refs, not state: endCall also runs from event handlers set up when the
    // call connected, where `status` and `seconds` are old copies.
    const wasConnected = connectedRef.current || status === "connected";
    const dur = secondsRef.current;
    setStatus("ended");
    try {
      localAudioRef.current?.stop();
      localVideoRef.current?.stop();
      leaveRoom();
      // Clear video DOM immediately so the local preview disappears the moment the call ends.
      setLocalVideoTrack(null);
      setRemoteVideoTrack(null);
    } catch {
      /* ignore */
    }
    if (callId) {
      // Supabase queries are lazy: nothing is sent until the builder is
      // awaited or .then()'d. A bare `void supabase...` never reached the
      // database, so hanging up never told the other side (a caller who
      // cancelled before pickup left the callee's phone ringing).
      void supabase
        .from("calls")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("id", callId)
        .then(({ error }) => {
          if (error) console.warn("[call] failed to mark call ended", error);
        });
    }
    if (wasConnected) {
      void logCallMessage("ended", dur);
    } else if (role === "caller") {
      // Caller cancelled before pickup: stop their phone ringing (it shows
      // as a missed call there).
      pushCallCancelled(callId, "cancelled");
      void logCallMessage("no_answer", 0);
    }
    // (The person called hanging up before it connected: the caller sees
    // the call ended and records it as declined.)
    cleanupAndExit();
  };

  // Try to play the remote <audio> element. If browser blocks autoplay,
  // surface a tap-to-enable button.
  const tryPlayRemoteAudio = async () => {
    const el = remoteAudioEl.current;
    if (!el) return;
    try {
      // A call on hold stays silent until it's resumed.
      el.muted = heldRef.current;
      el.volume = 1;
      await el.play();
      setNeedsTapForSound(false);
    } catch {
      setNeedsTapForSound(true);
    }
  };

  const attachRemoteTrack = (track: RemoteTrack) => {
    if (track.kind === "audio") {
      const el = remoteAudioEl.current;
      if (!el) return;
      (track as unknown as { attach: (el: HTMLMediaElement) => HTMLMediaElement }).attach(el);
      void tryPlayRemoteAudio();
    } else if (track.kind === "video") {
      // Hand the track to RemoteMedia, which owns DOM attachment.
      setRemoteVideoTrack(track as RemoteVideoTrack);
    }
  };

  const detachRemoteTrack = (track: RemoteTrack) => {
    if (track.kind === "video") {
      setRemoteVideoTrack((curr) => (curr === (track as RemoteVideoTrack) ? null : curr));
    }
  };

  const handleParticipant = (participant: RemoteParticipant) => {
    participant.tracks.forEach((pub: RemoteTrackPublication) => {
      if (pub.track) attachRemoteTrack(pub.track);
    });
    participant.on("trackSubscribed", (track: RemoteTrack) => attachRemoteTrack(track));
    participant.on("trackUnsubscribed", (track: RemoteTrack) => detachRemoteTrack(track));
  };

  /** Leave the call room on purpose (so it isn't taken for a lost connection). */
  const leaveRoom = () => {
    const room = roomRef.current;
    roomRef.current = null;
    try { room?.disconnect(); } catch { /* ignore */ }
  };

  // ── The other person's connection dropped ─────────────────────────────
  // Their phone lost signal, switched network or restarted the app. The call
  // stays on and says "Reconnecting…"; if they're back within the grace
  // period it carries on. If they hung up, the call's saved status says so
  // (handled by the status watcher above) and it ends straight away.
  const lostTimerRef = useRef<number | null>(null);
  const lostShowRef = useRef<number | null>(null);
  const stopLostGrace = () => {
    if (lostTimerRef.current) window.clearTimeout(lostTimerRef.current);
    if (lostShowRef.current) window.clearTimeout(lostShowRef.current);
    lostTimerRef.current = null;
    lostShowRef.current = null;
  };
  const startLostGrace = () => {
    if (endedRef.current || lostTimerRef.current) return;
    // Not shown for a blip of a second or two.
    lostShowRef.current = window.setTimeout(() => {
      if (!endedRef.current && (roomRef.current?.participants.size ?? 0) === 0) setReconnecting(true);
    }, 2500);
    lostTimerRef.current = window.setTimeout(async () => {
      lostTimerRef.current = null;
      if (endedRef.current) return;
      if ((roomRef.current?.participants.size ?? 0) > 0) return;
      const { data } = await supabase.from("calls").select("status").eq("id", callId).maybeSingle();
      if (endedRef.current) return;
      if (data?.status && data.status !== "accepted" && data.status !== "ringing") {
        handleCallStatus(data.status);
        return;
      }
      // Gone for the whole grace period: the call is lost.
      endNotice(tNow("cs.disconnected"));
      void endCallRef.current();
    }, RECONNECT_GRACE_MS);
  };

  // ── This phone's own connection dropped ───────────────────────────────
  // The call room connection closed without anyone ending the call: join
  // again (same microphone and camera) until it's back or the grace period
  // runs out. Only then does the call end, as a real failure.
  const rejoiningRef = useRef(false);
  const rejoin = async () => {
    if (rejoiningRef.current || endedRef.current) return;
    rejoiningRef.current = true;
    setReconnecting(true);
    const deadline = Date.now() + RECONNECT_GRACE_MS;
    let delay = 1500;
    try {
      while (!endedRef.current && Date.now() < deadline) {
        await wait(delay);
        if (endedRef.current) return;
        delay = Math.min(Math.round(delay * 1.5), 5000);
        if (typeof navigator !== "undefined" && navigator.onLine === false) continue;
        // Ended meanwhile (the other person hung up)? Then don't come back.
        const { data, error } = await supabase.from("calls").select("status").eq("id", callId).maybeSingle();
        if (endedRef.current) return;
        if (!error && data?.status && data.status !== "accepted" && data.status !== "ringing") {
          handleCallStatus(data.status);
          return;
        }
        if (await joinRoom({ rejoin: true })) return;
      }
      if (!endedRef.current) {
        endNotice(tNow("cs.disconnected"));
        void endCallRef.current();
      }
    } finally {
      rejoiningRef.current = false;
    }
  };

  /**
   * Join the call room. `early`: the caller joining while it still rings, so
   * the screen keeps ringing and a failure here isn't the end of the call
   * (joining is tried again when the other person answers). `rejoin`: back
   * into the call after the connection dropped. `resume`: back into the call
   * after the app reloaded. Returns whether this phone is in the room.
   */
  const joinRoom = async (opts: { early?: boolean; rejoin?: boolean; resume?: boolean } = {}): Promise<boolean> => {
    if (roomRef.current) return true;
    if (joiningRef.current || endedRef.current) return false;
    joiningRef.current = true;
    if (!opts.early && !opts.rejoin) setStatus((s) => (s === "connected" ? s : "connecting"));
    try {
      // On Android native, the voice audio route must be active before
      // Twilio starts capturing/publishing WebRTC tracks. Starting this only
      // after "connected" can leave both sides with silent call media.
      await startCallForegroundService();

      const reuse = (t: LocalAudioTrack | LocalVideoTrack | null) =>
        t && !(t as unknown as { isStopped?: boolean }).isStopped ? t : null;
      const keptAudio = reuse(localAudioRef.current) as LocalAudioTrack | null;
      const keptVideo = reuse(localVideoRef.current) as LocalVideoTrack | null;
      if ((opts.rejoin || opts.resume) && roomNeedsTwilioSetup(roomName)) {
        // The room may have been closed while nobody was in it: open it again.
        await supabase.functions
          .invoke("twilio-room", { body: { action: "create", roomName } })
          .catch(() => {});
      }

      // Both usually already in hand: the token was fetched while it rang
      // and the microphone was switched on when Call/Accept was tapped.
      const [token, preparedMedia] = await Promise.all([
        getCallToken(roomName).then((t) => {
          markCall(callId, "token");
          return t;
        }),
        keptAudio ? Promise.resolve(null) : takePreparedCallMedia(),
      ]);
      if (endedRef.current) {
        try { preparedMedia?.audioTrack.stop(); preparedMedia?.videoTrack?.stop(); } catch { /* ignore */ }
        return false;
      }
      const audio = keptAudio ?? preparedMedia?.audioTrack ?? await createLocalAudioTrack();
      localAudioRef.current = audio;
      if (mutedRef.current) audio.disable();
      const tracks: (LocalAudioTrack | LocalVideoTrack)[] = [audio];
      if (isVideo) {
        const video = keptVideo ?? preparedMedia?.videoTrack ?? await createLocalVideoTrack({ width: 640 });
        localVideoRef.current = video;
        tracks.push(video);
        setLocalVideoTrack(video);
      } else if (preparedMedia?.videoTrack) {
        // Voice call: never publish video. Stop any prepared video track immediately.
        try { preparedMedia.videoTrack.stop(); } catch { /* ignore */ }
      }

      const room = await connectCall(roomName, token, tracks, () => renewCallToken(roomName));
      if (endedRef.current) {
        room.disconnect();
        return false;
      }
      roomRef.current = room;
      markCall(callId, "joined");
      // The caller joined while ringing: "connected" only once the other
      // person arrives (participantConnected below).
      const otherHere = room.participants.size > 0;
      if (otherHere || (role === "callee" && !opts.rejoin && !opts.resume)) markConnected();
      else if (opts.rejoin || opts.resume) {
        // Back in, but the other person isn't (yet): wait for them.
        if (connectedRef.current || opts.resume) startLostGrace();
      }
      if (!otherHere && opts.rejoin && !connectedRef.current) setReconnecting(false);
      // Put on hold before it connected (e.g. a call came in while ringing).
      if (heldRef.current) {
        localAudioRef.current?.disable();
        localVideoRef.current?.disable();
      }

      room.participants.forEach(handleParticipant);
      room.on("participantConnected", (p: RemoteParticipant) => {
        handleParticipant(p);
        markConnected();
      });
      room.on("participantDisconnected", () => {
        // Never ends the call by itself (see startLostGrace).
        if (room.participants.size === 0) startLostGrace();
      });
      // Twilio is getting this phone's connection back by itself.
      room.on("reconnecting", () => {
        if (!endedRef.current) setReconnecting(true);
      });
      room.on("reconnected", () => {
        if (!endedRef.current && room.participants.size > 0) setReconnecting(false);
      });
      room.on("disconnected", (_r: Room, error?: { code?: number }) => {
        if (endedRef.current || roomRef.current !== room) return; // left on purpose
        roomRef.current = null;
        setRemoteVideoTrack(null);
        if (error?.code === 53205) {
          // This account joined the same call from another phone, which
          // carries the call on. Leave it here quietly.
          endNotice(tNow("cs.moved"));
          void cleanupAndExit({ keepRoom: true });
          return;
        }
        void rejoin();
      });

      // Make sure audio element is unmuted + ready.
      void tryPlayRemoteAudio();
      return true;
    } catch (err) {
      if (opts.early) {
        // Not fatal while it's still ringing: joining is tried again on answer.
        console.warn("[call] early join failed", err);
        return false;
      }
      if (opts.rejoin) return false; // rejoin() keeps trying
      if (!isMediaError(err)) {
        // A network problem joining: keep trying for a while rather than
        // dropping the call at once.
        console.warn("[call] join failed, retrying", err);
        joiningRef.current = false;
        void rejoin();
        return false;
      }
      const msg = formatCallMediaError(err, isVideo);
      endNotice(tNow("call.failed"), { description: msg, destructive: true });
      // Tell the other side too, so they aren't left waiting on "Connecting".
      void supabase
        .from("calls")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("id", callId)
        .in("status", ["ringing", "accepted"])
        .then(() => {});
      cleanupAndExit();
      return false;
    } finally {
      joiningRef.current = false;
    }
  };

  const markConnected = () => {
    stopLostGrace();
    setReconnecting(false);
    if (endedRef.current) return;
    if (connectedRef.current) {
      setStatus("connected");
      return;
    }
    connectedRef.current = true;
    setStatus("connected");
    markCall(callId, "connected");
    // Remember the call on this phone, so it can be picked up again if the
    // app reloads.
    saveLiveCall(params, resume?.connectedAt ?? Date.now());
  };

  const toggleMute = () => {
    const t = localAudioRef.current;
    if (!t) return;
    // While on hold the mic stays off; the new setting applies on resume.
    if (muted) { if (!heldRef.current) t.enable(); }
    else t.disable();
    setMuted(!muted);
  };
  const toggleVideo = () => {
    const t = localVideoRef.current;
    if (!t) return;
    if (videoEnabled) t.disable();
    else if (!heldRef.current) t.enable();
    setVideoEnabled(!videoEnabled);
  };

  // Speaker toggle. On the web we can only route to a different output device
  // via setSinkId() where supported; otherwise we just bump/cut volume so the
  // user gets a perceptible change.
  const toggleSpeaker = async () => {
    const next = !speakerOn;
    setSpeakerOn(next);
    const el = remoteAudioEl.current;
    if (!el) return;
    try {
      const elAny = el as HTMLAudioElement & {
        setSinkId?: (id: string) => Promise<void>;
      };
      if (typeof elAny.setSinkId === "function") {
        // "" = default (loudspeaker on mobile browsers); "communications" = earpiece on some.
        await elAny.setSinkId(next ? "" : "communications").catch(() => {});
      }
      el.volume = next ? 1 : 0.4;
    } catch { /* ignore */ }
  };

  // Detect whether more than one camera exists so we can enable/disable the switch button.
  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    navigator.mediaDevices.enumerateDevices().then((devs) => {
      const cams = devs.filter((d) => d.kind === "videoinput");
      setCanSwitchCamera(cams.length > 1);
    }).catch(() => { /* ignore */ });
  }, [isVideo, videoEnabled]);

  // Switch front <-> back camera by replacing the published video track.
  const switchCamera = async () => {
    const room = roomRef.current;
    if (!room || !isVideo) return;
    const next: "user" | "environment" = facingMode === "user" ? "environment" : "user";
    try {
      const newTrack = await createLocalVideoTrack({
        facingMode: { ideal: next },
        width: 640,
      });
      const oldTrack = localVideoRef.current;
      // Republish: unpublish old, publish new.
      if (oldTrack) {
        room.localParticipant.unpublishTrack(oldTrack);
        oldTrack.stop();
      }
      await room.localParticipant.publishTrack(newTrack);
      localVideoRef.current = newTrack;
      // Refresh local preview.
      setLocalVideoTrack(newTrack);
      setFacingMode(next);
      setVideoEnabled(true);
    } catch (err) {
      toast({
        title: tNow("cs.cantSwitchCam"),
        description: formatCallMediaError(err, true),
        variant: "destructive",
      });
    }
  };

  // Actually publish a local camera track and flip UI to video mode.
  const publishLocalVideo = async () => {
    const room = roomRef.current;
    if (!room || isVideo) return;
    try {
      const newTrack = await createLocalVideoTrack({
        facingMode: { ideal: "user" },
        width: 640,
      });
      await room.localParticipant.publishTrack(newTrack);
      localVideoRef.current = newTrack;
      setLocalVideoTrack(newTrack);
      setIsVideo(true);
      setVideoEnabled(true);
      setFacingMode("user");
    } catch (err) {
      toast({
        title: tNow("cs.cantSwitchVideo"),
        description: formatCallMediaError(err, true),
        variant: "destructive",
      });
    }
  };

  // Request the other party's consent before switching to video. Both sides
  // must enable their camera so the call is truly video on both ends.
  const upgradeToVideo = () => {
    const room = roomRef.current;
    const ch = callChannelRef.current;
    if (!room || isVideo || !ch || upgradeRequest) return;
    setUpgradeRequest("outgoing");
    void ch.send({
      type: "broadcast",
      event: "video-upgrade-request",
      payload: { fromUserId: user?.id },
    });
    if (upgradeTimeoutRef.current) window.clearTimeout(upgradeTimeoutRef.current);
    upgradeTimeoutRef.current = window.setTimeout(() => {
      setUpgradeRequest((curr) => {
        if (curr === "outgoing") {
          toast({ title: tNow("cs.noVideoResponse") });
          return null;
        }
        return curr;
      });
    }, 20_000);
  };

  const cancelVideoUpgrade = () => {
    const ch = callChannelRef.current;
    if (upgradeTimeoutRef.current) window.clearTimeout(upgradeTimeoutRef.current);
    setUpgradeRequest(null);
    if (ch) {
      void ch.send({
        type: "broadcast",
        event: "video-upgrade-cancel",
        payload: { fromUserId: user?.id },
      });
    }
  };

  const acceptVideoUpgrade = async () => {
    const ch = callChannelRef.current;
    setUpgradeRequest(null);
    if (ch) {
      void ch.send({
        type: "broadcast",
        event: "video-upgrade-response",
        payload: { accepted: true, fromUserId: user?.id },
      });
    }
    await publishLocalVideo();
  };

  const declineVideoUpgrade = () => {
    const ch = callChannelRef.current;
    setUpgradeRequest(null);
    if (ch) {
      void ch.send({
        type: "broadcast",
        event: "video-upgrade-response",
        payload: { accepted: false, fromUserId: user?.id },
      });
    }
  };

  const endCallRef = useRef(endCall);
  endCallRef.current = endCall;

  // Hang up from outside this screen (the waiting-call card's Accept, or the
  // held-call card's End). `handover`: another call takes the screen next.
  useEffect(
    () =>
      registerEndHandler(callId, ({ handover }) => {
        if (handover) handoverRef.current = true;
        void endCallRef.current();
      }),
    [callId],
  );

  // Hold: stop sending our mic and camera, silence theirs, and tell them so
  // their screen says "On hold". Resume restores whatever was on before.
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const videoEnabledRef = useRef(videoEnabled);
  videoEnabledRef.current = videoEnabled;
  const firstHoldRun = useRef(true);
  useEffect(() => {
    const first = firstHoldRun.current;
    firstHoldRun.current = false;
    if (first && !held) return;
    const a = localAudioRef.current;
    const v = localVideoRef.current;
    const el = remoteAudioEl.current;
    if (held) {
      a?.disable();
      v?.disable();
      if (el) el.muted = true;
    } else {
      if (a && !mutedRef.current) a.enable();
      if (v && videoEnabledRef.current) v.enable();
      if (el) {
        el.muted = false;
        void el.play().catch(() => {});
      }
    }
    void callChannelRef.current?.send({ type: "broadcast", event: "hold", payload: { held } });
  }, [held]);
  // Safety nets so a camera/mic can never be left running without a call UI.
  // Neither of these ENDS the call: only End, the other person hanging up,
  // or a connection that never comes back does. The other person sees
  // "Reconnecting…" and this phone joins again when the app is back
  // (CallRecovery picks the call up).
  // 1. This session being taken down while the call is still on (it
  //    normally only goes once the call is over): leave the room here.
  useEffect(() => {
    return () => {
      if (endedRef.current) return;
      stopLostGrace();
      try {
        localAudioRef.current?.stop();
        localVideoRef.current?.stop();
      } catch { /* ignore */ }
      leaveRoom();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 2. The page itself closing or reloading mid-call: release the camera
  //    and mic and leave the room. If the page comes back from the
  //    browser's cache instead, join the call again.
  useEffect(() => {
    const onPageHide = () => {
      if (endedRef.current) return;
      try {
        localAudioRef.current?.stop();
        localVideoRef.current?.stop();
      } catch { /* ignore */ }
      leaveRoom();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted && !endedRef.current && !roomRef.current) void rejoin();
    };
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While the call is on: note it on this phone every few seconds (so a
  // reload can pick it up), and on the server every 20 s, so a call left
  // open by a phone that died is recognised as over and never blocks new
  // calls between the two.
  useEffect(() => {
    if (status !== "connected" || !callId) return;
    let serverBeat = true;
    const beat = () => {
      supabase
        .from("calls")
        .update({ last_active_at: new Date().toISOString() } as never)
        .eq("id", callId)
        .eq("status", "accepted")
        .then(({ error }) => {
          // Server without the column yet: stop trying.
          if (error) serverBeat = false;
        });
    };
    beat();
    let n = 0;
    const id = window.setInterval(() => {
      touchLiveCall(callId);
      n += 1;
      if (serverBeat && n % 4 === 0) beat();
    }, 5000);
    return () => window.clearInterval(id);
  }, [status, callId]);

  // Leave the call screen without ending the call.
  const minimize = () => {
    const t = minimizeTarget(conversationId, location.state);
    if ("back" in t) navigate(-1);
    else navigate(t.to, { replace: true });
  };

  const videoFullscreen = isVideo && status === "connected";

  // The remote <audio> element must stay in the document for the whole call:
  // a media element removed from the page is paused, which would silence the
  // other person the moment the call was minimised.
  const remoteAudio = (
    <audio
      ref={remoteAudioEl}
      autoPlay
      playsInline
      {...({ "webkit-playsinline": "true" } as Record<string, string>)}
      className="hidden"
    />
  );

  // A call on hold behind another call draws nothing but its audio element
  // (kept first in every branch, so React reuses the same element).
  if (!foreground) return <>{remoteAudio}</>;

  const onHold = held || remoteHeld;
  const otherCalls = callsSnap.calls.filter((c) => c.callId !== callId);
  const showHold = !!callsSnap.waiting || otherCalls.length > 0 || held;

  if (!onCallScreen) {
    // Same tree shape as the full-screen branch below (audio first, then the
    // UI), so React keeps the SAME <audio> element when switching views.
    return (
      <>
        {remoteAudio}
        <FloatingCallBubble
          key="bubble"
          isVideo={isVideo}
          other={other}
          status={status}
          reconnecting={reconnecting && status === "connected"}
          seconds={seconds}
          remoteVideoTrack={remoteVideoTrack}
          localVideoTrack={localVideoTrack}
          localVideoEnabled={videoEnabled}
          muted={muted}
          onToggleMute={toggleMute}
          onEndCall={endCall}
          onOpen={() =>
            navigate(
              `/call/${conversationId}?type=${initialIsVideo ? "video" : "voice"}&callId=${callId}&room=${encodeURIComponent(roomName)}&role=${role}`,
              { state: { [FROM_CALL_BUBBLE]: true } },
            )
          }
        />
      </>
    );
  }

  return (
    <>
    {remoteAudio}
    <CallFullScreen
      key="full"
      {...{
        videoFullscreen,
        localVideoTrack,
        remoteVideoTrack,
        videoSwapped,
        setVideoSwapped,
        isVideo,
        other,
        status,
        reconnecting,
        seconds,
        role,
        onHold,
        callsSnap,
        otherCalls,
        navigate,
        callId,
        minimize,
        needsTapForSound,
        tryPlayRemoteAudio,
        upgradeRequest,
        acceptVideoUpgrade,
        declineVideoUpgrade,
        cancelVideoUpgrade,
        muted,
        videoEnabled,
        speakerOn,
        canSwitchCamera,
        toggleMute,
        toggleVideo,
        toggleSpeaker,
        switchCamera,
        upgradeToVideo,
        endCall,
        conversationId,
        held,
        showHold,
      }}
    />
    </>
  );
}
