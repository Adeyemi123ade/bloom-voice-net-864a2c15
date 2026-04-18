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
import MobileFrame from "@/components/MobileFrame";
import CallHeader from "@/components/call/CallHeader";
import CallControls from "@/components/call/CallControls";
import RemoteVideo from "@/components/call/RemoteVideo";
import { useAuth } from "@/hooks/useAuth";
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

  const roomRef = useRef<Room | null>(null);
  const localAudioRef = useRef<LocalAudioTrack | null>(null);
  const localVideoRef = useRef<LocalVideoTrack | null>(null);
  const localVideoEl = useRef<HTMLDivElement>(null);
  const remoteVideoEl = useRef<HTMLDivElement>(null);
  const remoteAudioEl = useRef<HTMLDivElement>(null);
  const tickTimer = useRef<number | null>(null);
  const endedRef = useRef(false);

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
          const row: any = payload.new;
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
    } catch {}
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
    } catch {}
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

  const attachTrack = (track: RemoteTrack, container: HTMLDivElement | null) => {
    if (!container) return;
    if (track.kind === "video" || track.kind === "audio") {
      const el = (track as any).attach();
      el.style.width = "100%";
      el.style.height = "100%";
      el.style.objectFit = "cover";
      container.appendChild(el);
    }
  };

  const handleParticipant = (participant: RemoteParticipant) => {
    participant.tracks.forEach((pub: RemoteTrackPublication) => {
      if (pub.track) {
        attachTrack(
          pub.track,
          pub.track.kind === "video" ? remoteVideoEl.current : remoteAudioEl.current,
        );
      }
    });
    participant.on("trackSubscribed", (track: RemoteTrack) => {
      attachTrack(
        track,
        track.kind === "video" ? remoteVideoEl.current : remoteAudioEl.current,
      );
    });
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

        {isVideo && status === "connected" ? (
          <RemoteVideo ref={remoteVideoEl} localPreviewRef={localVideoEl} />
        ) : (
          <div className="flex-1" />
        )}
        <div ref={remoteAudioEl} className="hidden" />

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
