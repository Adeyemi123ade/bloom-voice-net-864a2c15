import { tNow } from "@/lib/i18n/language";
import { Phone, Video } from "lucide-react";
import { useIsOnline } from "@/lib/network";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type Profile = { id: string; display_name: string | null; avatar_url: string | null };

type Props = {
  isVideo: boolean;
  other: Profile | null;
  status: "connecting" | "ringing" | "connected" | "ended";
  /** The connection dropped and is coming back; the call is still on. */
  reconnecting?: boolean;
  /** This phone's own connection is poor (not the other person's). */
  poorNetwork?: boolean;
  seconds: number;
  role?: "caller" | "callee";
  /** You put this call on hold, or the other person did. */
  onHold?: boolean;
  /** A call-waiting / held-call card occupies the top: sit below it, smaller. */
  belowCard?: boolean;
  /** Shown over a live video: keep it small at the very top. */
  overlay?: boolean;
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

export default function CallHeader({
  isVideo,
  other,
  status,
  reconnecting = false,
  poorNetwork = false,
  seconds,
  role = "caller",
  onHold = false,
  belowCard = false,
  overlay = false,
}: Props) {
  // No network on this phone: say so plainly instead of "Ringing"/"Reconnecting".
  const offline = !useIsOnline() && status !== "ended";
  const size = overlay ? "small" : belowCard ? "medium" : "large";
  const Icon = isVideo ? Video : Phone;
  const headerLabel =
    status === "connected"
      ? isVideo ? tNow("call.video") : tNow("call.voice")
      : role === "callee"
        ? tNow("ch.incoming")
        : tNow("ch.calling");
  return (
    <div
      className={`pb-2 flex flex-col items-center gap-3 ${
        overlay
          ? "pt-8"
          : belowCard
            ? "pt-[calc(env(safe-area-inset-top)+min(40vh,340px)+72px)]"
            : "pt-[calc(env(safe-area-inset-top)+12vh)]"
      }`}
    >
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
        <span>{headerLabel}</span>
        <Icon className="w-3.5 h-3.5" />
      </div>
      {/* While the other phone rings, rings pulse out from the avatar. Tied
          to the real call status, so they stop the moment the call connects,
          is declined, fails or ends. */}
      <div
        className={`${size === "large" ? "my-6" : "my-2"} rounded-full ${status === "ringing" ? "call-ring" : ""}`}
        data-testid="call-avatar"
        data-ringing={status === "ringing" ? "true" : "false"}
      >
        <Avatar
          className={`${size === "large" ? "w-32 h-32" : size === "medium" ? "w-20 h-20" : "w-14 h-14"} ring-4 ring-primary/30`}
        >
          <AvatarImage src={other?.avatar_url ?? undefined} />
          <AvatarFallback
          className={`bg-primary/20 text-foreground font-semibold ${size === "large" ? "text-4xl" : "text-xl"}`}
        >
            {initials(other?.display_name)}
          </AvatarFallback>
        </Avatar>
      </div>
      <h1
        className={`${size === "large" ? "text-2xl" : "text-lg"} font-bold text-center px-4 ${overlay ? "" : "text-foreground"}`}
      >
        {other?.display_name ?? tNow("chat.contact")}
      </h1>
      <p className="text-sm text-muted-foreground">
        {offline && tNow("login.offlineTitle")}
        {!offline && status === "ringing" && tNow("oc.ringing")}
        {!offline && status === "connecting" && tNow("fb.connecting")}
        {!offline && status === "connected" && (reconnecting ? (poorNetwork ? tNow("ch.poorNetwork") : tNow("ch.reconnecting")) : onHold ? tNow("cs.onHold") : fmt(seconds))}
        {status === "ended" && tNow("cs.ended")}
      </p>
      {status === "connected" && !onHold && !reconnecting && (
        <span className="mt-1 inline-flex items-center gap-1.5 text-2xs text-accent">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          {tNow("ch.connected")}
        </span>
      )}
    </div>
  );
}
