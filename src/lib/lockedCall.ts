/**
 * Calls answered from the phone's lock screen. Such a call shows on top of
 * the lock screen without unlocking, so its screen must not lead anywhere
 * else in the app (no "minimise" to the chats).
 */
const lockedCalls = new Set<string>();

export function markLockedCall(callId: string): void {
  lockedCalls.add(callId);
}

export function isLockedCall(callId: string | null | undefined): boolean {
  return !!callId && lockedCalls.has(callId);
}
