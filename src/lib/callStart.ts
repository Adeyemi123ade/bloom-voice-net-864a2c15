import type { NavigateFunction } from "react-router-dom";
import { activeCallPath, getActiveCall } from "@/lib/activeCall";
import { startCallTimeline } from "@/lib/callTimeline";
import { tapFeedback } from "@/lib/haptics";

// Starting a call. The call screen opens IMMEDIATELY on the tap; the slow
// parts (microphone, saving the call, waking the other phone, the call room)
// run behind it in the call session (see CallScreen, "outgoing setup").
// Previously all of that ran before the screen changed: 1-3 s of nothing
// after tapping, and every extra tap started another call.

let lastStart = 0;

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // Older WebViews: RFC 4122 v4 from getRandomValues.
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
}

export type OutgoingCall = {
  conversationId: string;
  calleeId: string;
  type: "voice" | "video";
  peer: { name: string; avatarUrl?: string | null };
};

/**
 * Open the outgoing call screen now. Repeated taps (within 2 s, or while a
 * call is running) never start a second call; during a call they go back to it.
 */
export function beginOutgoingCall(call: OutgoingCall, navigate: NavigateFunction): void {
  const active = getActiveCall();
  if (active) {
    navigate(activeCallPath(active));
    return;
  }
  const now = Date.now();
  if (now - lastStart < 2000) return;
  lastStart = now;
  tapFeedback();
  const callId = newId();
  const roomName = `chichat-${call.conversationId}-${now}`;
  startCallTimeline(callId, "caller");
  navigate(
    `/call/${call.conversationId}?type=${call.type}&callId=${callId}&room=${encodeURIComponent(roomName)}&role=caller`,
    { replace: true, state: { peer: call.peer, setup: { calleeId: call.calleeId } } },
  );
}
