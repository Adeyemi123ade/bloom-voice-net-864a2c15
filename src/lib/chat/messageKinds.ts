// What kind of thing a message row holds, decided from its content prefix,
// plus the plain-language wording the UI shows for it. Messages are stored as
// prefixed strings ("[voice]<url>", "[file]<url>|...", "[call]voice|ended|29"),
// and those raw strings must never reach the screen.
import { CALL_PREFIX, VOICE_PREFIX } from "@/lib/chat/format";
import { FILE_PREFIX, parseFileMessage } from "@/components/chat/AttachmentBubble";

export type MessageKind = "text" | "voice" | "image" | "video" | "document" | "call";

export function messageKind(content: string): MessageKind {
  if (content.startsWith(CALL_PREFIX)) return "call";
  if (content.startsWith(VOICE_PREFIX)) return "voice";
  if (content.startsWith(FILE_PREFIX)) {
    const mime = parseFileMessage(content)?.mime ?? "";
    if (mime.startsWith("image/") && mime !== "image/svg+xml") return "image";
    if (mime.startsWith("video/")) return "video";
    return "document";
  }
  return "text";
}

export type CallLog = {
  callType: "voice" | "video";
  /** ended | no_answer | missed | rejected | declined | received */
  kind: string;
  duration: number;
};

export function parseCallLog(content: string): CallLog | null {
  if (!content.startsWith(CALL_PREFIX)) return null;
  const [type, kind = "", dur = "0"] = content.slice(CALL_PREFIX.length).split("|");
  const duration = Number.parseInt(dur, 10);
  return {
    callType: type === "video" ? "video" : "voice",
    kind,
    duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
  };
}

/** 29 → "00:29", 75 → "01:15", 3725 → "1:02:05". */
export function formatCallClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${String(m).padStart(2, "0")}:${ss}`;
}

/** Text of a message without the "> quoted reply" first line it may carry. */
export function stripQuotedReply(content: string): string {
  if (!content.startsWith("> ")) return content;
  const nl = content.indexOf("\n");
  return nl > -1 ? content.slice(nl + 1) : content;
}

/** Short label for a non-text message, e.g. in a notification or chat list. */
export function mediaLabel(content: string): string {
  const kind = messageKind(content);
  if (kind === "voice") return "Voice note";
  if (kind === "image") return parseFileMessage(content)?.caption || "Photo";
  if (kind === "video") return parseFileMessage(content)?.caption || "Video";
  if (kind === "document") return parseFileMessage(content)?.name || "Document";
  return "";
}

/** 40 → "40 secs", 75 → "1 min", 190 → "3 mins", 3900 → "1 hr 5 mins". */
export function callDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} sec${s === 1 ? "" : "s"}`;
  const totalMin = Math.round(s / 60);
  if (totalMin < 60) return `${totalMin} min${totalMin === 1 ? "" : "s"}`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `${h} hr ${m} min${m === 1 ? "" : "s"}` : `${h} hr`;
}

export type CallView = {
  callType: "voice" | "video";
  /** "Voice call", "Video call", "Missed voice call", "Call failed". */
  title: string;
  /** "3 mins", "No answer", "Declined", "Tap to call back"; null shows nothing. */
  detail: string | null;
  tone: "normal" | "missed" | "failed";
  /** This person made the call. */
  outgoing: boolean;
};

/**
 * How a call record reads for the person looking at it. `mine` = they
 * wrote the record. Records are written by the caller (one per call);
 * older chats also hold records from the person called ("received",
 * "declined"), which read from that side.
 */
export function describeCall(content: string, mine: boolean): CallView | null {
  const call = parseCallLog(content);
  if (!call) return null;
  const isVideo = call.callType === "video";
  const type = isVideo ? "Video call" : "Voice call";
  // A "declined" record was written by the person called.
  const outgoing = call.kind === "declined" || call.kind === "received" ? !mine : mine;
  const base = { callType: call.callType, outgoing };
  switch (call.kind) {
    case "no_answer":
    case "missed":
      return outgoing
        ? { ...base, title: type, detail: "No answer", tone: "normal" }
        : { ...base, title: isVideo ? "Missed video call" : "Missed voice call", detail: "Tap to call back", tone: "missed" };
    case "rejected":
    case "declined":
      return { ...base, title: type, detail: "Declined", tone: "normal" };
    case "failed":
      return { ...base, title: "Call failed", detail: "Try again", tone: "failed" };
    default:
      // "ended" (and anything older): the length, or nothing when it never really started.
      return { ...base, title: type, detail: call.duration > 0 ? callDuration(call.duration) : null, tone: "normal" };
  }
}

type CallRecordLike = { id: string; content: string; created_at: string; sender_id: string };

/**
 * Older chats hold two or three records per call. These ids repeat a call
 * already shown and are hidden: "Received call" records, a "declined"
 * written next to the caller's "rejected", and the second "ended" when both
 * people logged the end of the same call. A duplicate is always the OTHER
 * person's record of the same moment, so two real calls in a row stay.
 */
export function duplicateCallRecordIds(messages: CallRecordLike[]): Set<string> {
  const hide = new Set<string>();
  const calls = messages
    .map((m) => ({ m, call: parseCallLog(m.content), t: Date.parse(m.created_at) || 0 }))
    .filter((x) => x.call);
  calls.forEach((x, i) => {
    const kind = x.call!.kind;
    if (kind === "received") {
      hide.add(x.m.id);
      return;
    }
    if (kind === "declined") {
      if (calls.some((y) => y.call!.kind === "rejected" && y.m.sender_id !== x.m.sender_id && Math.abs(y.t - x.t) <= 60_000)) hide.add(x.m.id);
      return;
    }
    if (kind === "ended") {
      for (let j = i - 1; j >= 0; j--) {
        const y = calls[j];
        if (x.t - y.t > 15_000) break;
        if (hide.has(y.m.id)) continue;
        if (
          y.call!.kind === "ended" &&
          y.m.sender_id !== x.m.sender_id &&
          y.call!.callType === x.call!.callType &&
          Math.abs(y.call!.duration - x.call!.duration) <= 5
        ) {
          hide.add(x.m.id);
          break;
        }
      }
    }
  });
  return hide;
}

export type Preview = {
  kind: "text" | "voice" | "file" | "call";
  text: string;
  callType?: "voice" | "video";
  callKind?: string;
  missed?: boolean;
  outgoing?: boolean;
};

/** Chat-list preview of a conversation's last message (moved from Home). */
export function buildPreview(content: string | null, senderId: string | null, myId: string): Preview {
  if (!content) return { kind: "text", text: "" };
  const call = parseCallLog(content);
  if (call) {
    // Same wording as the call record in the chat.
    const v = describeCall(content, senderId === myId)!;
    const missed = v.tone === "missed";
    const text = missed || v.tone === "failed" ? v.title : v.detail ?? v.title;
    return { kind: "call", text, callType: call.callType, callKind: call.kind, missed, outgoing: v.outgoing };
  }
  const kind = messageKind(content);
  if (kind === "voice") return { kind: "voice", text: "Voice note" };
  if (kind !== "text") return { kind: "file", text: mediaLabel(content) };
  if (content.startsWith(FILE_PREFIX)) return { kind: "file", text: "Attachment" };
  const cleaned = content.startsWith("> ") ? stripQuotedReply(content).trim() || content : content;
  return { kind: "text", text: cleaned };
}

/**
 * Wording for an in-app notification about an incoming message. Returns null
 * when no notification should show: call records the other person logged
 * while you were on that same call (the call screen shows its own "Call
 * connected" / "Call ended" notices), or an empty row.
 */
export function notificationText(content: string | null | undefined): string | null {
  if (!content) return null;
  const call = parseCallLog(content);
  if (call) {
    // The caller logs "no_answer" when you didn't pick up: that's a missed call for you.
    if (call.kind === "no_answer" || call.kind === "missed")
      return call.callType === "video" ? "Missed video call" : "Missed voice call";
    return null;
  }
  const kind = messageKind(content);
  if (kind === "voice") return "🎤 Voice note";
  if (kind === "image") return `📷 ${mediaLabel(content)}`;
  if (kind === "video") return `🎥 ${mediaLabel(content)}`;
  if (kind === "document") return `📄 ${mediaLabel(content)}`;
  const text = stripQuotedReply(content).trim();
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

type SelectableMessage = { id: string; content: string; sender_id: string; deleted_for_everyone: boolean };

export type SelectionActions = {
  /** Items Copy / Share / Forward act on: everything except call records and deleted messages. */
  actionable: SelectableMessage[];
  canCopy: boolean;
  canShare: boolean;
  canForward: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canDeleteForEveryone: boolean;
  /** How many selected items an action like Forward will leave out (call records, deleted). */
  skipped: number;
};

/**
 * Which bulk actions to offer for the current selection. Decided by the
 * types of the selected items, and recalculated whenever the selection
 * changes. A call record in the selection no longer switches every other
 * item to Delete-only: Copy/Share/Forward stay available for the messages and
 * simply leave the call records out. Call records themselves only support
 * Delete.
 */
export function selectionActions(selected: SelectableMessage[], myId: string | undefined): SelectionActions {
  const actionable = selected.filter((m) => !m.deleted_for_everyone && messageKind(m.content) !== "call");
  const allText = actionable.length > 0 && actionable.every((m) => messageKind(m.content) === "text");
  const live = selected.filter((m) => !m.deleted_for_everyone);
  const only = selected.length === 1 ? selected[0] : null;
  return {
    actionable,
    // One item of any supported type, or several text messages (copied as one text).
    canCopy: actionable.length === 1 || allText,
    canShare: actionable.length > 0,
    canForward: actionable.some((m) => stripQuotedReply(m.content).trim().length > 0),
    canEdit:
      !!only &&
      only.sender_id === myId &&
      !only.deleted_for_everyone &&
      messageKind(only.content) === "text",
    canDelete: selected.length > 0,
    canDeleteForEveryone: live.length > 0 && live.length === selected.length && selected.every((m) => m.sender_id === myId),
    skipped: selected.length - actionable.length,
  };
}
