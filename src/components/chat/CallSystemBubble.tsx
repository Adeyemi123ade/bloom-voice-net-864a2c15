import { PhoneIncoming, PhoneMissed, PhoneOutgoing, Video } from "lucide-react";
import { formatTime } from "@/lib/chat/format";
import { describeCall } from "@/lib/chat/messageKinds";

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

/**
 * A call in the chat, WhatsApp style: what happened on top ("Voice call",
 * "Missed voice call", "Call failed"), the detail and time below ("3 mins",
 * "No answer", "Declined", "Tap to call back"). No "0 secs": a call with no
 * length shows just its title. Sized to its text, so it never wraps.
 */
export function CallSystemBubble({
  m,
  mine,
}: {
  m: Message;
  mine: boolean;
}) {
  const v = describeCall(m.content, mine);
  if (!v) return null;
  const alert = v.tone !== "normal";
  const Icon = v.tone === "missed"
    ? PhoneMissed
    : v.callType === "video"
      ? Video
      : v.outgoing
        ? PhoneOutgoing
        : PhoneIncoming;
  const time = (
    <span className="text-2xs text-muted-foreground whitespace-nowrap">{formatTime(m.created_at)}</span>
  );

  return (
    // Not a button: taps are handled by the row around it (CallRow), which
    // decides between "select" (selection mode), "jump" (search) and
    // "confirm a call back". A button here used to start the call-back flow
    // and swallow the tap, so a call record could never be added to a
    // selection by tapping it.
    <div
      role="button"
      data-testid="call-record"
      className={`inline-flex items-center gap-3 pl-2.5 pr-3 py-2.5 rounded-2xl text-left bg-card text-foreground shadow-sm whitespace-nowrap ${
        mine ? "rounded-br-sm" : "rounded-bl-sm"
      } hover:opacity-90 transition cursor-pointer`}
    >
      <div className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center ${
        alert ? "bg-destructive/15" : "bg-primary/10"
      }`}>
        <Icon className={`w-[18px] h-[18px] ${alert ? "text-destructive" : "text-primary"}`} />
      </div>
      {v.detail ? (
        <div className="flex flex-col gap-0.5">
          <span className={`text-[15px] font-semibold leading-tight ${v.tone === "missed" ? "text-destructive" : ""}`}>
            {v.title}
          </span>
          <span className="flex items-baseline gap-3.5">
            <span className="text-[13px] text-muted-foreground">{v.detail}</span>
            {time}
          </span>
        </div>
      ) : (
        <span className="flex items-baseline gap-3.5">
          <span className="text-[15px] font-semibold leading-tight">{v.title}</span>
          {time}
        </span>
      )}
    </div>
  );
}
