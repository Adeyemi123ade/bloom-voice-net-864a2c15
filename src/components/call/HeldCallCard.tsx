import { tNow } from "@/lib/i18n/language";
import { Pause, PhoneOff, ArrowLeftRight } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

function initials(name?: string | null) {
  if (!name) return "?";
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

/**
 * Small card for a call that's on hold while another call is on screen.
 * Swap brings it back (and holds the call on screen); End hangs it up.
 */
export default function HeldCallCard({
  name,
  avatarUrl,
  onSwap,
  onEnd,
}: {
  name: string;
  avatarUrl: string | null;
  onSwap: () => void;
  onEnd: () => void;
}) {
  return (
    <div
      data-testid="held-call-card"
      className="fixed z-40 right-3 top-[calc(env(safe-area-inset-top)+64px)] w-[46%] max-w-[220px] rounded-2xl bg-card/95 backdrop-blur border border-border shadow-lg p-3 flex flex-col items-center gap-2 text-center"
    >
      <Avatar className="w-14 h-14 ring-2 ring-muted">
        <AvatarImage src={avatarUrl ?? undefined} />
        <AvatarFallback className="bg-muted text-foreground font-semibold">{initials(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 w-full">
        <p className="text-sm font-semibold text-foreground truncate">{name}</p>
        <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
          <Pause className="w-3 h-3" /> {tNow("cs.onHold")}
        </p>
      </div>
      <div className="flex w-full gap-2">
        <button
          type="button"
          onClick={onSwap}
          aria-label={tNow("hc.swapTo", { name })}
          className="flex-1 h-9 rounded-full bg-primary text-primary-foreground text-xs font-semibold inline-flex items-center justify-center gap-1"
        >
          <ArrowLeftRight className="w-3.5 h-3.5" /> {tNow("hc.swap")}
        </button>
        <button
          type="button"
          onClick={onEnd}
          aria-label={tNow("hc.endWith", { name })}
          className="w-9 h-9 rounded-full bg-destructive text-destructive-foreground inline-flex items-center justify-center shrink-0"
        >
          <PhoneOff className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
