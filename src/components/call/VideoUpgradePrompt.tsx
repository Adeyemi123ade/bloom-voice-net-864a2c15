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
        <div className="flex items-center gap-2 text-base text-foreground">
          <Video className="w-4 h-4 text-primary animate-pulse" />
          <span>Waiting for {fromName || "them"} to accept video…</span>
        </div>
        <button
          onClick={onCancel}
          className="text-base px-3 py-1.5 rounded-full bg-background hover:bg-background/80 text-foreground"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="mx-4 mb-2 rounded-xl bg-secondary/95 backdrop-blur px-4 py-3 border border-border">
      <div className="flex items-center gap-2 text-base text-foreground mb-3">
        <Video className="w-4 h-4 text-primary" />
        <span>
          <strong>{fromName || "They"}</strong> wants to switch to video
        </span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onDecline}
          className="flex-1 h-9 rounded-full bg-background hover:bg-background/80 text-foreground text-base flex items-center justify-center gap-1"
        >
          <X className="w-4 h-4" /> Decline
        </button>
        <button
          onClick={onAccept}
          className="flex-1 h-9 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground text-base font-medium flex items-center justify-center gap-1"
        >
          <Check className="w-4 h-4" /> Accept
        </button>
      </div>
    </div>
  );
}
