import { tNow } from "@/lib/i18n/language";
import { Video, X, Check } from "lucide-react";

type Props = {
  mode: "incoming" | "outgoing";
  fromName?: string | null;
  onAccept?: () => void;
  onDecline?: () => void;
  onCancel?: () => void;
};

export default function VideoUpgradePrompt({ mode, fromName, onAccept, onDecline, onCancel }: Props) {
  if (mode === "outgoing") {
    return (
      <div className="mx-4 mb-2 rounded-xl bg-secondary/90 backdrop-blur px-4 py-3 flex items-center justify-between gap-3 border border-border">
        <div className="flex items-center gap-2 text-sm text-foreground">
          <Video className="w-4 h-4 text-primary animate-pulse" />
          <span>{tNow("vu.waiting", { name: fromName || tNow("vu.them") })}</span>
        </div>
        <button
          onClick={onCancel}
          className="text-xs px-3 py-1.5 rounded-full bg-background hover:bg-background/80 text-foreground"
        >
          {tNow("common.cancel")}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-4 mb-2 rounded-xl bg-secondary/95 backdrop-blur px-4 py-3 border border-border">
      <div className="flex items-center gap-2 text-sm text-foreground mb-3">
        <Video className="w-4 h-4 text-primary" />
        <span>
          {tNow("vu.wants", { name: fromName || tNow("vu.they") })}
        </span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onDecline}
          className="flex-1 h-9 rounded-full bg-background hover:bg-background/80 text-foreground text-sm flex items-center justify-center gap-1"
        >
          <X className="w-4 h-4" /> {tNow("vu.decline")}
        </button>
        <button
          onClick={onAccept}
          className="flex-1 h-9 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium flex items-center justify-center gap-1"
        >
          <Check className="w-4 h-4" /> {tNow("chat.accept")}
        </button>
      </div>
    </div>
  );
}
