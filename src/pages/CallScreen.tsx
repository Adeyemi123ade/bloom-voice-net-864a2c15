import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Mic, MicOff, Volume2, VolumeX, Video, VideoOff, PhoneOff, SwitchCamera } from "lucide-react";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type Profile = { id: string; display_name: string | null; avatar_url: string | null };

function initials(name?: string | null) {
  if (!name) return "?";
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}
function fmt(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
}

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

  // Load other participant profile
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

  // Subscribe to call status changes
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

  // Callee auto-accepts on mount (toast brought them here)
  useEffect(() => {
    if (role !== "callee" || !callId) return;
    (async () => {
      await supabase.from("calls").update({ status: "accepted" }).eq("id", callId);
      joinRoom();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, callId]);

  // Tick when connected
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

  const endCall = async () => {
    if (callId) {
      await supabase
        .from("calls")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("id", callId);
    }
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
        <div className="pt-8 pb-4 flex flex-col items-center gap-3">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
            {isVideo ? "Video call" : "Voice call"}
          </p>
          <Avatar className="w-24 h-24 ring-4 ring-primary/30">
            <AvatarImage src={other?.avatar_url ?? undefined} />
            <AvatarFallback className="bg-primary/20 text-foreground text-2xl font-semibold">
              {initials(other?.display_name)}
            </AvatarFallback>
          </Avatar>
          <h1 className="text-base font-semibold text-foreground">
            {other?.display_name ?? "Contact"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {status === "ringing" && "Ringing…"}
            {status === "connecting" && "Connecting…"}
            {status === "connected" && fmt(seconds)}
            {status === "ended" && "Call ended"}
          </p>
          {status === "connected" && (
            <span className="mt-1 inline-flex items-center gap-1.5 text-[10px] text-accent">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              Connected
            </span>
          )}
        </div>

        {/* Remote video */}
        {isVideo && status === "connected" && (
          <div className="mx-6 mt-2 flex-1 rounded-2xl bg-black/40 border border-border relative overflow-hidden">
            <div ref={remoteVideoEl} className="absolute inset-0" />
            <div
              ref={localVideoEl}
              className="absolute bottom-2 right-2 w-20 h-28 rounded-lg bg-secondary border border-border overflow-hidden"
            />
          </div>
        )}
        {(!isVideo || status !== "connected") && <div className="flex-1" />}
        {/* Hidden remote audio sink */}
        <div ref={remoteAudioEl} className="hidden" />

        <div className="px-6 pb-6">
          <div className="flex items-center justify-around">
            <button
              onClick={toggleMute}
              className={`w-11 h-11 rounded-full flex items-center justify-center ${
                muted
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-secondary text-foreground hover:bg-secondary/80"
              }`}
              aria-label="Mute"
            >
              {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <button
              className="w-11 h-11 rounded-full flex items-center justify-center bg-primary text-primary-foreground"
              aria-label="Speaker"
              disabled
              title="Speaker (browser default)"
            >
              <Volume2 className="w-4 h-4" />
            </button>
            <button
              onClick={toggleVideo}
              disabled={!isVideo}
              className={`w-11 h-11 rounded-full flex items-center justify-center ${
                videoEnabled
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-foreground hover:bg-secondary/80"
              } ${!isVideo ? "opacity-40" : ""}`}
              aria-label="Toggle video"
            >
              {videoEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
            </button>
            <button
              className="w-11 h-11 rounded-full flex items-center justify-center bg-secondary text-foreground hover:bg-secondary/80 opacity-40"
              aria-label="Switch camera"
              disabled
            >
              <SwitchCamera className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={endCall}
            className="mt-5 w-full h-12 rounded-full bg-destructive hover:bg-destructive/90 text-destructive-foreground flex items-center justify-center gap-2 font-medium text-sm"
          >
            <PhoneOff className="w-4 h-4" />
            End call
          </button>
        </div>
      </div>
    </MobileFrame>
  );
}
