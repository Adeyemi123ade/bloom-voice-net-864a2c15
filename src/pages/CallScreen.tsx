import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
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
} from "twilio-video";
import { Volume2 } from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import CallHeader from "@/components/call/CallHeader";
import CallControls from "@/components/call/CallControls";
import RemoteMedia from "@/components/call/RemoteMedia";
import { useAuth } from "@/hooks/useAuth";
import { useRingback } from "@/hooks/useRingback";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type Profile = { id: string; display_name: string | null; avatar_url: string | null };

export default function CallScreen() {
  const { id: conversationId } = useParams();
  const [params] = useSearchParams();
  const isVideo = params.get("type") === "video";
  const callId = params.get("callId");
  const roomName = params.get("room") ?? "";
  const role = (params.get("role") as "caller" | "callee") ?? "caller";
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  const [other, setOther] = useState<Profile | null>(null);
  const [status, setStatus] = useState<"connecting" | "ringing" | "connected" | "ended">(
    role === "caller" ? "ringing" : "connecting",
  );
  const [muted, setMuted] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(isVideo);
  const [seconds, setSeconds] = useState(0);
  const [needsTapForSound, setNeedsTapForSound] = useState(false);

  const roomRef = useRef<Room | null>(null);
  const localAudioRef = useRef<LocalAudioTrack | null>(null);
  const localVideoRef = useRef<LocalVideoTrack | null>(null);
  const localVideoEl = useRef<HTMLDivElement>(null);
  const remoteVideoEl = useRef<HTMLDivElement>(null);
  const remoteAudioEl = useRef<HTMLAudioElement>(null);
  const tickTimer = useRef<number | null>(null);
  const endedRef = useRef(false);

  // Caller hears classic phone ringback while waiting for the callee to pick up.
  useRingback(role === "caller" && status === "ringing");

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

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
      if (prof) setOther(prof as Profile);
    })();
  }, [user, conversationId]);

  useEffect(() => {
    if (!callId) return;
    const ch = supabase
      .channel(`call-${callId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "calls", filter: `id=eq.${callId}` },
        (payload) => {
          const row = payload.new as { status: string };
          if (row.status === "accepted" && status === "ringing") {
            joinRoom();
          } else if (row.status === "declined") {
            toast({ title: "Call declined" });
            cleanupAndExit();
          } else if (row.status === "ended") {
            cleanupAndExit();
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId, status]);

  useEffect(() => {
    if (role !== "callee" || !callId) return;
    (async () => {
      await supabase.from("calls").update({ status: "accepted" }).eq("id", callId);
      joinRoom();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, callId]);

  useEffect(() => {
    if (status !== "connected") return;
    tickTimer.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => {
      if (tickTimer.current) window.clearInterval(tickTimer.current);
    };
  }, [status]);

  const cleanupAndExit = async () => {
    if (endedRef.current) return;
    endedRef.current = true;
    setStatus("ended");
    if (tickTimer.current) window.clearInterval(tickTimer.current);
    try {
      localAudioRef.current?.stop();
      localVideoRef.current?.stop();
      roomRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    setTimeout(() => navigate(`/chat/${conversationId}`), 500);
  };

  const logCallMessage = async (kind: "ended" | "missed" | "declined", duration: number) => {
    if (!user || !conversationId) return;
    try {
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: `[call]${isVideo ? "video" : "voice"}|${kind}|${duration}`,
      });
    } catch {
      /* ignore */
    }
  };

  const endCall = async () => {
    const wasConnected = status === "connected";
    const dur = seconds;
    if (callId) {
      await supabase
        .from("calls")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("id", callId);
    }
    await logCallMessage(wasConnected ? "ended" : role === "caller" ? "missed" : "declined", dur);
    cleanupAndExit();
  };

  // Try to play the remote <audio> element. If browser blocks autoplay,
  // surface a tap-to-enable button.
  const tryPlayRemoteAudio = async () => {
    const el = remoteAudioEl.current;
    if (!el) return;
    try {
      el.muted = false;
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
      // Attach into our existing <audio> element so it actually plays.
      (track as unknown as { attach: (el: HTMLMediaElement) => HTMLMediaElement }).attach(el);
      void tryPlayRemoteAudio();
    } else if (track.kind === "video") {
      const container = remoteVideoEl.current;
      if (!container) return;
      const videoEl = (
        track as unknown as { attach: () => HTMLVideoElement }
      ).attach();
      videoEl.style.width = "100%";
      videoEl.style.height = "100%";
      videoEl.style.objectFit = "cover";
      videoEl.setAttribute("playsinline", "true");
      videoEl.muted = true; // video element shouldn't double-play audio
      container.appendChild(videoEl);
    }
  };

  const handleParticipant = (participant: RemoteParticipant) => {
    participant.tracks.forEach((pub: RemoteTrackPublication) => {
      if (pub.track) attachRemoteTrack(pub.track);
    });
    participant.on("trackSubscribed", (track: RemoteTrack) => attachRemoteTrack(track));
  };

  const joinRoom = async () => {
    if (roomRef.current) return;
    setStatus("connecting");
    try {
      const { data: tokenData, error: tokenErr } = await supabase.functions.invoke(
        "twilio-token",
        { body: { roomName } },
      );
      if (tokenErr) throw tokenErr;
      if (!tokenData?.token) throw new Error("No token returned");

      const audio = await createLocalAudioTrack();
      localAudioRef.current = audio;
      const tracks: (LocalAudioTrack | LocalVideoTrack)[] = [audio];
      if (isVideo) {
        const video = await createLocalVideoTrack({ width: 640 });
        localVideoRef.current = video;
        tracks.push(video);
        if (localVideoEl.current) {
          const el = video.attach();
          el.style.width = "100%";
          el.style.height = "100%";
          el.style.objectFit = "cover";
          el.setAttribute("playsinline", "true");
          (el as HTMLVideoElement).muted = true;
          localVideoEl.current.appendChild(el);
        }
      }

      const room = await connect(tokenData.token, {
        name: roomName,
        tracks,
        dominantSpeaker: false,
      });
      roomRef.current = room;
      setStatus("connected");

      room.participants.forEach(handleParticipant);
      room.on("participantConnected", handleParticipant);
      room.on("participantDisconnected", () => {
        toast({ title: "Other participant left" });
        endCall();
      });
      room.on("disconnected", cleanupAndExit);

      // Make sure audio element is unmuted + ready.
      void tryPlayRemoteAudio();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to join call";
      toast({ title: "Call failed", description: msg, variant: "destructive" });
      cleanupAndExit();
    }
  };

  const toggleMute = () => {
    const t = localAudioRef.current;
    if (!t) return;
    if (muted) t.enable();
    else t.disable();
    setMuted(!muted);
  };
  const toggleVideo = () => {
    const t = localVideoRef.current;
    if (!t) return;
    if (videoEnabled) t.disable();
    else t.enable();
    setVideoEnabled(!videoEnabled);
  };

  return (
    <MobileFrame>
      <div className="h-full w-full flex flex-col bg-gradient-to-b from-secondary to-background">
        <CallHeader isVideo={isVideo} other={other} status={status} seconds={seconds} />

        <RemoteMedia
          showVideo={isVideo && status === "connected"}
          localPreviewRef={localVideoEl}
          remoteVideoRef={remoteVideoEl}
          remoteAudioRef={remoteAudioEl}
        />

        {needsTapForSound && status === "connected" && (
          <button
            onClick={tryPlayRemoteAudio}
            className="mx-6 mb-2 px-4 py-2 rounded-full bg-primary text-primary-foreground text-xs font-medium flex items-center justify-center gap-2 animate-pulse"
          >
            <Volume2 className="w-4 h-4" />
            Tap to enable sound
          </button>
        )}

        <CallControls
          muted={muted}
          videoEnabled={videoEnabled}
          isVideo={isVideo}
          onToggleMute={toggleMute}
          onToggleVideo={toggleVideo}
          onEndCall={endCall}
        />
      </div>
    </MobileFrame>
  );
}
