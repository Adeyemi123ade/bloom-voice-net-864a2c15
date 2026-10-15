import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  connect,
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
import { ChevronDown, Volume2 } from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import CallHeader from "@/components/call/CallHeader";
import CallControls from "@/components/call/CallControls";
import RemoteMedia from "@/components/call/RemoteMedia";
import VideoUpgradePrompt from "@/components/call/VideoUpgradePrompt";
import FloatingCallBubble from "@/components/call/FloatingCallBubble";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useAuth } from "@/hooks/useAuth";
import { useRingback } from "@/hooks/useRingback";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatCallClock } from "@/lib/chat/messageKinds";
import { CALL_RING_TIMEOUT_MS } from "@/lib/callTiming";
import { pushCallCancelled } from "@/lib/pushNotify";
import { clearPreparedCallMedia, consumePreparedCallMedia, formatCallMediaError } from "@/lib/callMedia";
import { startCallForegroundService, stopCallForegroundService } from "@/lib/nativeCalls";
import {
  FROM_CALL_BUBBLE,
  activeCallPath,
  finishActiveCall,
  getCallsSnapshot,
  minimizeTarget,
  registerEndHandler,
  requestEndCall,
  setCallHeld,
  swapToCall,
  setCallPeer,
  useCalls,
  type ActiveCallParams,
} from "@/lib/activeCall";
import HeldCallCard from "@/components/call/HeldCallCard";

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
  const { user, loading } = useAuth();

  const [other, setOther] = useState<Profile | null>(null);
  const [status, setStatus] = useState<"connecting" | "ringing" | "connected" | "ended">(
    role === "caller" ? "ringing" : "connecting",
  );
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
  const [seconds, setSeconds] = useState(0);
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
      joinRoom();
      return;
    }
    if (handledStatusesRef.current.has(nextStatus)) return;
    handledStatusesRef.current.add(nextStatus);

    if (nextStatus === "declined") {
      endNotice("Call declined");
      if (role === "caller") void logCallMessage("rejected", 0);
      cleanupAndExit();
      return;
    }
    if (nextStatus === "missed") {
      if (role === "caller") {
        endNotice("No answer");
        void logCallMessage("no_answer", 0);
      }
      cleanupAndExit();
      return;
    }
    if (nextStatus === "ended") {
      cleanupAndExit();
    }
  };

  // Caller hears classic phone ringback while waiting for the callee to pick up.
  useRingback(role === "caller" && status === "ringing");

  // Signed out mid-call: release the camera/mic and leave the call. (The
  // route guard handles getting the user to /login.)
  useEffect(() => {
    if (!loading && !user) void cleanupAndExit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  useEffect(() => {
    document.title = `${isVideo ? "Video" : "Voice"} call — Chichat`;
  }, [isVideo]);

  useEffect(() => {
    if (!user || !conversationId) return;
    (async () => {
      const { data: parts } = await supabase
        .from("conversation_participants")
        .select("user_id")
        .eq("conversation_id", conversationId)
        .neq("user_id", user.id);
      const otherId = parts?.[0]?.user_id;
      if (!otherId) return;
      const { data: prof } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .eq("id", otherId)
        .maybeSingle();
      if (prof) {
        setOther(prof as Profile);
        setCallPeer(callId, { name: prof.display_name ?? "Contact", avatarUrl: prof.avatar_url ?? null });
      }
    })();
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
          toast({ title: "Video request declined" });
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
      endNotice("No answer");
      // Stop their phone ringing and leave a missed-call notice on it.
      pushCallCancelled(callId, "missed");
      void logCallMessage("no_answer", 0);
      cleanupAndExit();
    }, CALL_RING_TIMEOUT_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, status, callId]);

  useEffect(() => {
    if (role !== "callee" || !callId) return;
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
        endNotice("Call ended");
        cleanupAndExit();
        return;
      }
      // Answered here: stop any other phone of mine that's still ringing.
      pushCallCancelled(callId, "answered");
      joinRoom();
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
    if (!roomName) return;
    try {
      await supabase.functions.invoke("twilio-room", {
        body: { action: "complete", roomName },
      });
    } catch (e) {
      console.warn("twilio-room complete failed", e);
    }
  };

  const cleanupAndExit = async () => {
    if (endedRef.current) return;
    endedRef.current = true;
    setStatus("ended");
    if (tickTimer.current) window.clearInterval(tickTimer.current);
    try {
      localAudioRef.current?.stop();
      localVideoRef.current?.stop();
      roomRef.current?.disconnect();
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
    void completeRoom();
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
        callNotice(connectedRef.current ? `Call ended · ${formatCallClock(secondsRef.current)}` : "Call ended");
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
  const logCallMessage = async (
    kind: "ended" | "missed" | "no_answer" | "declined" | "rejected" | "received",
    duration: number,
  ) => {
    if (!user || !conversationId) return;
    try {
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: `[call]${isVideo ? "video" : "voice"}|${kind}|${duration}`,
      });
    } catch { /* ignore */ }
  };

  const endCall = async () => {
    const wasConnected = status === "connected";
    const dur = seconds;
    setStatus("ended");
    try {
      localAudioRef.current?.stop();
      localVideoRef.current?.stop();
      roomRef.current?.disconnect();
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
    } else {
      // Receiver hung up before connecting (decline)
      void logCallMessage("declined", 0);
    }
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

  const joinRoom = async () => {
    if (roomRef.current || joiningRef.current) return;
    joiningRef.current = true;
    setStatus("connecting");
    try {
      // On Android native, the voice audio route must be active before
      // Twilio starts capturing/publishing WebRTC tracks. Starting this only
      // after "connected" can leave both sides with silent call media.
      await startCallForegroundService();

      const { data: tokenData, error: tokenErr } = await supabase.functions.invoke(
        "twilio-token",
        { body: { roomName } },
      );
      if (tokenErr) throw tokenErr;
      if (!tokenData?.token) throw new Error("No token returned");

      const preparedMedia = consumePreparedCallMedia();
      const audio = preparedMedia?.audioTrack ?? await createLocalAudioTrack();
      localAudioRef.current = audio;
      const tracks: (LocalAudioTrack | LocalVideoTrack)[] = [audio];
      if (isVideo) {
        const video = preparedMedia?.videoTrack ?? await createLocalVideoTrack({ width: 640 });
        localVideoRef.current = video;
        tracks.push(video);
        setLocalVideoTrack(video);
      } else if (preparedMedia?.videoTrack) {
        // Voice call: never publish video. Stop any prepared video track immediately.
        try { preparedMedia.videoTrack.stop(); } catch { /* ignore */ }
      }

      const room = await connect(tokenData.token, {
        name: roomName,
        tracks,
        dominantSpeaker: false,
      });
      roomRef.current = room;
      setStatus("connected");
      connectedRef.current = true;
      // Put on hold before it connected (e.g. a call came in while ringing).
      if (heldRef.current) {
        localAudioRef.current?.disable();
        localVideoRef.current?.disable();
      }
      // Receiver logs that the call was received successfully (caller logs "ended" on hangup).
      if (role === "callee") void logCallMessage("received", 0);

      room.participants.forEach(handleParticipant);
      room.on("participantConnected", handleParticipant);
      room.on("participantDisconnected", () => {
        // Twilio fires this on transient network blips during ICE/DTLS renegotiation.
        // Wait briefly and only end the call if the remote really stayed gone.
        window.setTimeout(() => {
          if (endedRef.current) return;
          if (!roomRef.current) return;
          if (roomRef.current.participants.size === 0) {
            toast({ title: "Other participant left" });
            endCall();
          }
        }, 3500);
      });
      room.on("disconnected", cleanupAndExit);

      // Make sure audio element is unmuted + ready.
      void tryPlayRemoteAudio();
    } catch (err) {
      const msg = formatCallMediaError(err, isVideo);
      endNotice("Call failed", { description: msg, destructive: true });
      cleanupAndExit();
    } finally {
      joiningRef.current = false;
    }
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
        title: "Couldn't switch camera",
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
        title: "Couldn't switch to video",
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
          toast({ title: "No response to video request" });
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

  // Safety nets so a camera/mic can never be left running without a call UI.
  // 1. This session unmounting while the call is still live (it normally
  //    only unmounts after cleanupAndExit) ends the call for BOTH sides.
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
  useEffect(() => {
    return () => {
      if (!endedRef.current) void endCallRef.current();
    };
  }, []);
  // 2. Tab closed / reloaded / navigated off-site mid-call: release the
  //    camera and mic and leave the room. The other side sees the
  //    participant leave and ends the call on its end.
  useEffect(() => {
    const onPageHide = () => {
      if (endedRef.current) return;
      try {
        localAudioRef.current?.stop();
        localVideoRef.current?.stop();
        roomRef.current?.disconnect();
      } catch { /* ignore */ }
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

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
    <MobileFrame key="full">
      <div
        className={`h-full w-full flex flex-col ${
          videoFullscreen ? "bg-black" : "bg-gradient-to-b from-secondary to-background"
        }`}
      >
        <RemoteMedia
          showVideo={videoFullscreen}
          localVideoTrack={localVideoTrack}
          remoteVideoTrack={remoteVideoTrack}
          swapped={videoSwapped}
          onSwap={() => setVideoSwapped((s) => !s)}
        />

        <div
          className={
            videoFullscreen
              ? "fixed top-0 inset-x-0 z-20 bg-gradient-to-b from-black/70 via-black/40 to-transparent text-white pointer-events-none"
              : ""
          }
        >
          <CallHeader isVideo={isVideo} other={other} status={status} seconds={seconds} role={role} onHold={onHold} />
        </div>

        {videoFullscreen && onHold && (
          <div className="fixed inset-0 z-10 bg-black/60 flex items-center justify-center pointer-events-none">
            <span className="px-4 py-2 rounded-full bg-white/15 text-white text-sm font-semibold">On hold</span>
          </div>
        )}

        {otherCalls.map((c) => {
          const peer = callsSnap.info[c.callId];
          return (
            <HeldCallCard
              key={c.callId}
              name={peer?.name ?? "Contact"}
              avatarUrl={peer?.avatarUrl ?? null}
              onSwap={() => {
                swapToCall(c.callId);
                navigate(activeCallPath(c), { replace: true });
              }}
              onEnd={() => requestEndCall(c.callId)}
            />
          );
        })}

        {status !== "ended" && (
          <button
            type="button"
            onClick={minimize}
            aria-label="Minimise call"
            title="Minimise call"
            className={`fixed z-30 left-3 top-[calc(env(safe-area-inset-top)+12px)] w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
              videoFullscreen
                ? "bg-black/40 text-white hover:bg-black/60"
                : "bg-secondary/80 text-foreground hover:bg-secondary"
            }`}
          >
            <ChevronDown className="w-5 h-5" />
          </button>
        )}

        {needsTapForSound && status === "connected" && (
          <button
            onClick={tryPlayRemoteAudio}
            className={`${
              videoFullscreen ? "fixed bottom-44 left-1/2 -translate-x-1/2 z-30" : "mx-6 mb-2"
            } px-4 py-2 rounded-full bg-primary text-primary-foreground text-xs font-medium flex items-center justify-center gap-2 animate-pulse`}
          >
            <Volume2 className="w-4 h-4" />
            Tap to enable sound
          </button>
        )}

        <div
          className={
            videoFullscreen
              ? "fixed bottom-0 inset-x-0 z-20 pb-2 bg-gradient-to-t from-black/70 via-black/30 to-transparent"
              : ""
          }
        >
        {upgradeRequest && status === "connected" && (
          <VideoUpgradePrompt
            mode={upgradeRequest}
            fromName={other?.display_name}
            onAccept={acceptVideoUpgrade}
            onDecline={declineVideoUpgrade}
            onCancel={cancelVideoUpgrade}
          />
        )}
        <CallControls
          muted={muted}
          videoEnabled={videoEnabled}
          isVideo={isVideo}
          speakerOn={speakerOn}
          canSwitchCamera={canSwitchCamera}
          onToggleMute={toggleMute}
          onToggleVideo={toggleVideo}
          onToggleSpeaker={toggleSpeaker}
          onSwitchCamera={switchCamera}
          onUpgradeToVideo={upgradeToVideo}
          onEndCall={endCall}
          showHold={showHold && status !== "ended"}
          held={held}
          onToggleHold={() => setCallHeld(callId, !held)}
        />
        </div>
      </div>
    </MobileFrame>
    </>
  );
}
