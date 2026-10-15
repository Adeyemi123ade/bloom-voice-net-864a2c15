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
}: {
  m: Message;
  mine: boolean;
}) {
  // [call]video|<kind>|<duration>
  // kind ∈ ended | no_answer | missed | rejected | declined | received
  const [, body] = m.content.split(CALL_PREFIX);
  const [type, kind, durStr] = (body ?? "").split("|");
  const isVideo = type === "video";
  const dur = parseInt(durStr || "0", 10);
  const isMissed = kind === "missed" || kind === "no_answer";
  const Icon = isMissed ? PhoneMissed : mine ? PhoneOutgoing : PhoneIncoming;

  // Per-side wording (sender-of-the-log perspective).
  let label = "";
  if (kind === "ended") label = isVideo ? "Video call ended" : "Voice call ended";
  else if (mine && kind === "no_answer") label = "No answer";
  else if (mine && kind === "rejected") label = "Call rejected";
  // The caller logs "no_answer" when you didn't pick up, so on your side
  // it's a missed call (it used to read just "Voice call").
  else if (!mine && isMissed) label = isVideo ? "Missed video call" : "Missed voice call";
  else if (!mine && kind === "received") label = "Received call";
  else if (!mine && kind === "declined") label = "Call ended";
  else label = isVideo ? "Video call" : "Voice call";

  // Line 2: duration in "X secs" / "M:SS" form, or hint for missed.
  const subtitle = isMissed
    ? "Tap to call back"
    : dur > 0
      ? dur < 60
        ? `${dur} sec${dur === 1 ? "" : "s"}`
        : fmtDuration(dur)
      : "0 secs";

  return (
    // Not a button: taps are handled by the row around it (CallRow), which
    // decides between "select" (selection mode), "jump" (search) and
    // "confirm a call back". A button here used to start the call-back flow
    // and swallow the tap, so a call record could never be added to a
    // selection by tapping it.
    <div
      role="button"
      className={`w-fit max-w-[85%] flex items-center gap-3 pl-2 pr-3 py-2 rounded-2xl text-left bg-card text-foreground shadow-sm ${
        mine ? "rounded-br-sm" : "rounded-bl-sm"
      } hover:opacity-90 transition cursor-pointer`}
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
    </div>
  );
}
