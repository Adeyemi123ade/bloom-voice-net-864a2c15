import { Phone, Video } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type Profile = { id: string; display_name: string | null; avatar_url: string | null };

type Props = {
  isVideo: boolean;
  other: Profile | null;
  status: "connecting" | "ringing" | "connected" | "ended";
  seconds: number;
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

export default function CallHeader({ isVideo, other, status, seconds }: Props) {
  const Icon = isVideo ? Video : Phone;
  return (
    <div className="pt-8 pb-4 flex flex-col items-center gap-3">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-muted-foreground">
        <span>Calling</span>
        <Icon className="w-3.5 h-3.5" />
      </div>
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
  );
}
