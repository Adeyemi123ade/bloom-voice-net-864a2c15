import { isLimitError, isSuspendedError } from "@/lib/accountStatus";
import { isNoPhoneError } from "@/lib/phoneRequired";
import { tNow } from "@/lib/i18n/language";
import type { NavigateFunction } from "react-router-dom";
import { FROM_CALL_BUBBLE, activeCallPath, getActiveCall, getCallsSnapshot } from "@/lib/activeCall";
import { startCallTimeline } from "@/lib/callTimeline";
import { tapFeedback } from "@/lib/haptics";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { isOffline, showOfflineNotice } from "@/lib/network";
import { newRoomName } from "@/lib/callEngine";

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

/** Shown when Call is tapped for someone else while a call is on. */
/** Shown when a second call is started during a call (in the chosen language). */
export const endCurrentCallFirst = () => tNow("cs.endCurrent");

/** False (with a short note) while a ChiChat call is on. */
export function canStartAnotherCall(): boolean {
  if (getCallsSnapshot().calls.length === 0) return true;
  toast({ title: endCurrentCallFirst(), duration: 3000 });
  return false;
}

/**
 * Open the outgoing call screen now. Repeated taps (within 2 s, or while a
 * call is running) never start a second call. During a call, calling the
 * same person goes back to that call; calling anyone else is refused with a
 * short note (the call on now has to be ended first).
 */
export function beginOutgoingCall(call: OutgoingCall, navigate: NavigateFunction): void {
  const active = getActiveCall();
  if (active) {
    const same = getCallsSnapshot().calls.find((c) => c.conversationId === call.conversationId);
    if (same) navigate(activeCallPath(same), { state: { [FROM_CALL_BUBBLE]: true } });
    else toast({ title: endCurrentCallFirst(), duration: 3000 });
    return;
  }
  // No network: say so, and don't open a call screen that can't connect.
  if (isOffline()) {
    showOfflineNotice();
    return;
  }
  const now = Date.now();
  if (now - lastStart < 2000) return;
  lastStart = now;
  tapFeedback();
  const callId = newId();
  const roomName = newRoomName(call.conversationId, now);
  startCallTimeline(callId, "caller");
  navigate(
    `/call/${call.conversationId}?type=${call.type}&callId=${callId}&room=${encodeURIComponent(roomName)}&role=caller`,
    { replace: true, state: { peer: call.peer, setup: { calleeId: call.calleeId } } },
  );
}

export type SavedCall =
  | { result: "created" }
  /** A call between these two people is already ringing or on. */
  | { result: "existing"; call: { id: string; caller_id: string; callee_id: string; status: string; room_name: string; call_type: string; conversation_id: string } }
  /** The caller is already on another call (maybe on another phone). */
  | { result: "busy" }
  /** One of the two people has blocked the other. */
  | { result: "blocked" }
  /** Too many calls started in the last hour (limit for safety). */
  | { result: "limited" }
  /** This account is suspended. */
  | { result: "suspended" }
  /** This account has no phone number yet. */
  | { result: "no-phone" }
  | { result: "error" };

type RpcResult = { data: unknown; error: { code?: string; message?: string } | null };

function refusalResult(err: unknown): SavedCall | null {
  if (isSuspendedError(err)) return { result: "suspended" };
  if (isLimitError(err)) return { result: "limited" };
  if (isNoPhoneError(err)) return { result: "no-phone" };
  return null;
}

/**
 * Save a new call. The server does it in one step, so two taps, two phones
 * or two people calling each other at the same moment can never make two
 * calls: if a call between the two is already on, that call comes back
 * instead. (Until the server has that step, the call is saved directly.)
 */
export async function saveNewCall(row: {
  id: string;
  conversation_id: string;
  caller_id: string;
  callee_id: string;
  room_name: string;
  call_type: "voice" | "video";
}): Promise<SavedCall> {
  const rpc = (supabase as unknown as { rpc: (fn: string, args: object) => PromiseLike<RpcResult> }).rpc.bind(supabase);
  const r = await Promise.resolve(
    rpc("start_call", {
      _id: row.id,
      _conversation_id: row.conversation_id,
      _callee_id: row.callee_id,
      _room_name: row.room_name,
      _call_type: row.call_type,
    }),
  ).catch((e) => ({ data: null, error: { message: String(e) } }) as RpcResult);
  if (!r.error) {
    const d = r.data as SavedCall | null;
    if (d && (d.result === "created" || d.result === "existing" || d.result === "busy")) return d;
    return { result: "error" };
  }
  const refusal = refusalResult(r.error);
  if (refusal) return refusal;
  // Refused because one of the two has blocked the other.
  if (r.error.message === "blocked" || (r.error as { hint?: string }).hint === "chichat_blocked") {
    return { result: "blocked" };
  }
  // The server doesn't have start_call yet: save the call the old way.
  const missing =
    r.error.code === "PGRST202" ||
    r.error.code === "42883" ||
    /start_call/i.test(r.error.message ?? "");
  if (!missing) return { result: "error" };
  const { error } = await supabase.from("calls").insert(row);
  const insertRefusal = refusalResult(error);
  if (insertRefusal) return insertRefusal;
  if (error && (error.message === "blocked" || error.hint === "chichat_blocked")) return { result: "blocked" };
  return error ? { result: "error" } : { result: "created" };
}
