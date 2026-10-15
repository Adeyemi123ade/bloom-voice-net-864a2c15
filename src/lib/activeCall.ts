import { useSyncExternalStore } from "react";

// The one call this tab is currently in, kept OUTSIDE any route.
//
// Previously the whole call (Twilio room, camera, mic, status subscription)
// lived inside the /call/:id page component. Pressing Back unmounted that
// page while nothing disconnected the room or stopped the camera, so the
// call kept running with no screen to control it and no way back in.
//
// Now /call/:id only *registers* a call here. <ActiveCallHost /> (mounted
// once in App, above the routes) renders the call session for as long as
// the call lasts: full screen while you're on the call route, a small
// floating bubble everywhere else.

export type ActiveCallParams = {
  conversationId: string;
  callId: string;
  roomName: string;
  role: "caller" | "callee";
  initialIsVideo: boolean;
};

// Calls this tab is in. Usually one; two when the user puts a call on hold to
// answer another (call waiting). The "foreground" call is the one on screen;
// any other call is on hold.
type Entry = ActiveCallParams & { held: boolean };
let calls: Entry[] = [];
let foregroundId: string | null = null;
// Calls that have already ended in this tab. Lets the /call route tell a
// stale history entry (Back after the call ended) apart from a new call,
// so it never re-joins a finished call.
const ended = new Set<string>();
const listeners = new Set<() => void>();

// Snapshots handed to React must stay the same object until something changes.
export type CallsSnapshot = {
  calls: Entry[];
  foregroundId: string | null;
  /** A call ringing in while you're already on a call (call waiting). */
  waiting: WaitingCall | null;
  /** Names/photos of the people in each call, reported by each call session. */
  info: Record<string, CallPeer>;
};
export type WaitingCall = { callId: string; name: string; avatarUrl: string | null; isVideo: boolean };
export type CallPeer = { name: string; avatarUrl: string | null };
let waiting: WaitingCall | null = null;
let info: Record<string, CallPeer> = {};
let snapshot: CallsSnapshot = { calls, foregroundId, waiting, info };

const emit = () => {
  snapshot = { calls, foregroundId, waiting, info };
  listeners.forEach((l) => l());
};

/** The call on screen (may itself be on hold), or null when not in a call. */
export function getActiveCall(): ActiveCallParams | null {
  return calls.find((c) => c.callId === foregroundId) ?? null;
}

export function getCallsSnapshot(): CallsSnapshot {
  return snapshot;
}

/**
 * Start tracking a call. A second call is only taken when every existing
 * call is on hold (answering a waiting call after putting the first on hold);
 * otherwise this is ignored, so there's never more than one live call.
 */
export function startActiveCall(params: ActiveCallParams): void {
  if (calls.some((c) => c.callId === params.callId)) return;
  if (calls.some((c) => !c.held)) return;
  calls = [...calls, { ...params, held: false }];
  foregroundId = params.callId;
  emit();
}

/** True when a new incoming call may be added next to the current ones. */
export function canAddHeldCall(): boolean {
  return calls.length > 0 && calls.every((c) => c.held);
}

export function finishActiveCall(callId: string): void {
  ended.add(callId);
  delete endHandlers[callId];
  if (!calls.some((c) => c.callId === callId)) return;
  calls = calls.filter((c) => c.callId !== callId);
  if (info[callId]) {
    info = { ...info };
    delete info[callId];
  }
  if (foregroundId === callId) {
    // The remaining call (if any) comes back on screen and off hold.
    const next = calls[calls.length - 1] ?? null;
    foregroundId = next?.callId ?? null;
    if (next) calls = calls.map((c) => (c.callId === next.callId ? { ...c, held: false } : c));
  }
  emit();
}

export function isCallFinished(callId: string): boolean {
  return ended.has(callId);
}

/** Put a call on hold or take it off hold. */
export function setCallHeld(callId: string, held: boolean): void {
  if (!calls.some((c) => c.callId === callId && c.held !== held)) return;
  calls = calls.map((c) => (c.callId === callId ? { ...c, held } : c));
  emit();
}

/** Bring a held call back: the call on screen goes on hold, this one resumes. */
export function swapToCall(callId: string): void {
  if (!calls.some((c) => c.callId === callId)) return;
  calls = calls.map((c) => ({ ...c, held: c.callId !== callId }));
  foregroundId = callId;
  emit();
}

export function setWaitingCall(w: WaitingCall | null): void {
  if (waiting?.callId === w?.callId && waiting?.name === w?.name) return;
  waiting = w;
  emit();
}

export function setCallPeer(callId: string, peer: CallPeer): void {
  const cur = info[callId];
  if (cur && cur.name === peer.name && cur.avatarUrl === peer.avatarUrl) return;
  info = { ...info, [callId]: peer };
  emit();
}

// Lets UI outside a call session (the waiting-call card, the held-call card)
// hang up that call through the session's own end-call path.
type EndHandler = (opts: { handover: boolean }) => void;
const endHandlers: Record<string, EndHandler> = {};
export function registerEndHandler(callId: string, fn: EndHandler): () => void {
  endHandlers[callId] = fn;
  return () => {
    if (endHandlers[callId] === fn) delete endHandlers[callId];
  };
}
/**
 * End a call from outside its session. `handover` means another call is
 * about to take over the screen, so the ending call must not navigate away.
 */
export function requestEndCall(callId: string, opts: { handover?: boolean } = {}): void {
  endHandlers[callId]?.({ handover: !!opts.handover });
}

export function activeCallPath(c: ActiveCallParams): string {
  const type = c.initialIsVideo ? "video" : "voice";
  return `/call/${c.conversationId}?type=${type}&callId=${c.callId}&room=${encodeURIComponent(c.roomName)}&role=${c.role}`;
}

/** Router state set when the call screen is reopened from the floating bubble. */
export const FROM_CALL_BUBBLE = "fromCallBubble";

/**
 * Where "minimise" should go from the call screen: straight back to whatever
 * the user was doing if they reopened the call from the bubble, otherwise the
 * chat with the person they're calling (replacing the call entry, so Back
 * from that chat doesn't land on the call screen again).
 */
export function minimizeTarget(
  conversationId: string,
  locationState: unknown,
): { back: true } | { to: string } {
  const fromBubble = !!(locationState as Record<string, unknown> | null)?.[FROM_CALL_BUBBLE];
  const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
  if (fromBubble && idx > 0) return { back: true };
  return { to: `/chat/${conversationId}` };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useActiveCall(): ActiveCallParams | null {
  return useSyncExternalStore(subscribe, getActiveCall, getActiveCall);
}

export function useCalls(): CallsSnapshot {
  return useSyncExternalStore(subscribe, getCallsSnapshot, getCallsSnapshot);
}
