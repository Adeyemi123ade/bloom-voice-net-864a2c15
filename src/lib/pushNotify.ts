import { supabase } from "@/integrations/supabase/client";

// Pushes that reach the other person's phone when ChiChat isn't open there
// (sent by the send-call-push function to the Android app). Fire and forget:
// a failed push must never block sending a message or ending a call.

/** Tell the other person's phone about a message you just sent. */
export function pushNewMessage(messageId: string | null | undefined): void {
  if (!messageId || messageId.startsWith("tmp-")) return;
  void supabase.functions
    .invoke("send-call-push", { body: { action: "message", messageId } })
    .catch(() => {});
}

export type CallCancelReason =
  /** Nobody answered within 45 s: their phone shows a missed call. */
  | "missed"
  /** The caller hung up before it was answered: also a missed call. */
  | "cancelled"
  /** Answered on one of the callee's devices: stop the others ringing. */
  | "answered"
  /** Declined on one of the callee's devices: stop the others ringing. */
  | "declined";

/** Stop the callee's phone ringing for this call. */
export function pushCallCancelled(callId: string | null | undefined, reason: CallCancelReason): void {
  if (!callId) return;
  void supabase.functions
    .invoke("send-call-push", { body: { action: "cancel", callId, reason } })
    .catch(() => {});
}
