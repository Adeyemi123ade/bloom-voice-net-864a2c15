import { Phone, Video } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type Profile = { id: string; display_name: string | null; avatar_url: string | null };

type Props = {
  isVideo: boolean;
  other: Profile | null;
  status: "connecting" | "ringing" | "connected" | "ended";
  seconds: number;
  role?: "caller" | "callee";
  /** You put this call on hold, or the other person did. */
  onHold?: boolean;
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

export default function CallHeader({ isVideo, other, status, seconds, role = "caller", onHold = false }: Props) {
  const Icon = isVideo ? Video : Phone;
  const headerLabel =
    status === "connected"
      ? isVideo ? "Video call" : "Voice call"
      : role === "callee"
        ? "Incoming call"
        : "Calling";
  return (
    <div className="pt-8 pb-4 flex flex-col items-center gap-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
        <span>{headerLabel}</span>
        <Icon className="w-3.5 h-3.5" />
      </div>
      {/* While the other phone rings, rings pulse out from the avatar. Tied
          to the real call status, so they stop the moment the call connects,
          is declined, fails or ends. */}
      <div
        className={`my-6 ${status === "ringing" ? "call-ring" : ""}`}
        data-testid="call-avatar"
        data-ringing={status === "ringing" ? "true" : "false"}
      >
        <Avatar className="w-24 h-24 ring-4 ring-primary/30">
          <AvatarImage src={other?.avatar_url ?? undefined} />
          <AvatarFallback className="bg-primary/20 text-foreground text-2xl font-semibold">
            {initials(other?.display_name)}
          </AvatarFallback>
        </Avatar>
      </div>
      <h1 className="text-base font-semibold text-foreground">
        {other?.display_name ?? "Contact"}
      </h1>
      <p className="text-xs text-muted-foreground">
        {status === "ringing" && "Ringing…"}
        {status === "connecting" && "Connecting…"}
        {status === "connected" && (onHold ? "On hold" : fmt(seconds))}
        {status === "ended" && "Call ended"}
      </p>
      {status === "connected" && !onHold && (
        <span className="mt-1 inline-flex items-center gap-1.5 text-2xs text-accent">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          Connected
        </span>
      )}
    </div>
  );
}
