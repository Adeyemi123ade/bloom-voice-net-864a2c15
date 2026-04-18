import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Mic, MicOff, Volume2, VolumeX, Video, VideoOff, PhoneOff, SwitchCamera } from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

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
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  const [other, setOther] = useState<Profile | null>(null);
  const [status, setStatus] = useState<"ringing" | "connected" | "ended">("ringing");
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [video, setVideo] = useState(isVideo);
  const [seconds, setSeconds] = useState(0);
  const ringTimer = useRef<number | null>(null);
  const tickTimer = useRef<number | null>(null);

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

  // Simulate ringing -> connected after 2.5s
  useEffect(() => {
    ringTimer.current = window.setTimeout(() => setStatus("connected"), 2500);
    return () => {
      if (ringTimer.current) window.clearTimeout(ringTimer.current);
    };
  }, []);

  // Tick when connected
  useEffect(() => {
    if (status !== "connected") return;
    tickTimer.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => {
      if (tickTimer.current) window.clearInterval(tickTimer.current);
    };
  }, [status]);

  const end = () => {
    setStatus("ended");
    if (tickTimer.current) window.clearInterval(tickTimer.current);
    setTimeout(() => navigate(`/chat/${conversationId}`), 600);
  };

  return (
    <MobileFrame>
      <div className="h-full w-full flex flex-col bg-gradient-to-b from-secondary to-background">
        {/* Top */}
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

        {/* Video preview placeholder */}
        {video && status === "connected" && (
          <div className="mx-6 mt-2 flex-1 rounded-2xl bg-black/40 border border-border flex items-center justify-center relative overflow-hidden">
            <p className="text-[11px] text-muted-foreground">Video preview</p>
            <div className="absolute bottom-2 right-2 w-14 h-20 rounded-lg bg-secondary border border-border flex items-center justify-center">
              <p className="text-[9px] text-muted-foreground">You</p>
            </div>
          </div>
        )}
        {!video && <div className="flex-1" />}

        {/* Controls */}
        <div className="px-6 pb-6">
          <div className="flex items-center justify-around">
            <button
              onClick={() => setMuted((m) => !m)}
              className={`w-11 h-11 rounded-full flex items-center justify-center ${
                muted ? "bg-destructive text-destructive-foreground" : "bg-secondary text-foreground hover:bg-secondary/80"
              }`}
              aria-label="Mute"
            >
              {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setSpeaker((s) => !s)}
              className={`w-11 h-11 rounded-full flex items-center justify-center ${
                speaker ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-secondary/80"
              }`}
              aria-label="Speaker"
            >
              {speaker ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setVideo((v) => !v)}
              className={`w-11 h-11 rounded-full flex items-center justify-center ${
                video ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-secondary/80"
              }`}
              aria-label="Toggle video"
            >
              {video ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
            </button>
            <button
              onClick={() => {}}
              className="w-11 h-11 rounded-full flex items-center justify-center bg-secondary text-foreground hover:bg-secondary/80"
              aria-label="Switch camera"
            >
              <SwitchCamera className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={end}
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
