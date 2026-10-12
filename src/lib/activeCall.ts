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

let current: ActiveCallParams | null = null;
// Calls that have already ended in this tab. Lets the /call route tell a
// stale history entry (Back after the call ended) apart from a new call,
// so it never re-joins a finished call.
const ended = new Set<string>();
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

export function getActiveCall(): ActiveCallParams | null {
  return current;
}

export function startActiveCall(params: ActiveCallParams): void {
  if (current) return;
  current = params;
  emit();
}

export function finishActiveCall(callId: string): void {
  ended.add(callId);
  if (current?.callId !== callId) return;
  current = null;
  emit();
}

export function isCallFinished(callId: string): boolean {
  return ended.has(callId);
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
