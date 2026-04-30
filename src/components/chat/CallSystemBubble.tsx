import { PhoneIncoming, PhoneMissed, PhoneOutgoing } from "lucide-react";
import { CALL_PREFIX, fmtDuration, formatTime } from "@/lib/chat/format";

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
  edited_at: string | null;
  deleted_for_everyone: boolean;
};

export function CallSystemBubble({
  m,
  mine,
  onCallBack,
}: {
  m: Message;
  mine: boolean;
  otherName?: string | null;
  onCallBack?: (type: "voice" | "video") => void;
}) {
  // [call]video|<kind>|<duration>
  // kind ∈ ended | no_answer | missed | rejected | declined | received
  const [, body] = m.content.split(CALL_PREFIX);
  const [type, kind, durStr] = (body ?? "").split("|");
  const isVideo = type === "video";
  const callType: "voice" | "video" = isVideo ? "video" : "voice";
  const dur = parseInt(durStr || "0", 10);
  const isMissed = kind === "missed" || kind === "no_answer";
  const Icon = isMissed ? PhoneMissed : mine ? PhoneOutgoing : PhoneIncoming;

  // Per-side wording (sender-of-the-log perspective).
  let label = "";
  if (kind === "ended") label = isVideo ? "Video call ended" : "Voice call ended";
  else if (mine && kind === "no_answer") label = "No answer";
  else if (mine && kind === "rejected") label = "Call rejected";
  else if (!mine && kind === "missed") label = isVideo ? "Missed video call" : "Missed voice call";
  else if (!mine && kind === "received") label = "Received call";
  else if (!mine && kind === "declined") label = "Call ended";
  else label = isVideo ? "Video call" : "Voice call";

  const handleTap = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onCallBack) return;
    onCallBack(callType);
  };

  // Line 2: duration in "X secs" / "M:SS" form, or hint for missed.
  const subtitle = isMissed
    ? "Tap to call back"
    : dur > 0
      ? dur < 60
        ? `${dur} sec${dur === 1 ? "" : "s"}`
        : fmtDuration(dur)
      : "0 secs";

  return (
    <button
      type="button"
      onClick={handleTap}
      className={`min-w-[70%] max-w-[85%] flex items-center gap-3 pl-2 pr-3 py-2 rounded-2xl text-left ${
        mine
          ? "bg-primary/15 text-foreground rounded-br-sm"
          : "bg-secondary text-foreground rounded-bl-sm"
      } hover:opacity-90 transition`}
    >
      {/* Left: circular icon */}
      <div className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center ${
        isMissed ? "bg-destructive/15" : "bg-background/60"
      }`}>
        <Icon className={`w-4 h-4 ${isMissed ? "text-destructive" : "text-primary"}`} />
      </div>
      {/* Right: 2 lines — label + subtitle, with time bottom-right */}
      <div className="flex-1 min-w-0">
        <div className={`text-[13px] font-semibold leading-snug break-words ${isMissed ? "text-destructive" : ""}`}>
          {label}
        </div>
        <div className="flex items-end justify-between gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground break-words">{subtitle}</span>
          <span className="text-2xs text-muted-foreground shrink-0 whitespace-nowrap">
            {formatTime(m.created_at)}
          </span>
        </div>
      </div>
    </button>
  );
}
