// Tracks whether the current session came from a password-recovery OTP that
// hasn't been completed with a new password yet. Verifying a recovery code
// establishes a real, fully-privileged Supabase session (same as a normal
// login) *before* the user sets a new password — hitting Back or navigating
// away at that point would otherwise leave a live, persisted session sitting
// in the browser with the account's original password unchanged. This flag
// closes that gap: DeviceGate checks it and routes back to /reset-password
// instead of letting the session into the app.
//
// Always uses localStorage (not sessionStorage) because the underlying
// Supabase session is itself persisted to localStorage — a gate that only
// lived in sessionStorage would be bypassed simply by opening a new tab.
const PREFIX = "chichat.recovery_pending.";

function key(userId: string) {
  return `${PREFIX}${userId}`;
}

export function markRecoveryPending(userId: string) {
  try { localStorage.setItem(key(userId), "1"); } catch { /* ignore */ }
}

export function isRecoveryPending(userId: string): boolean {
  try { return localStorage.getItem(key(userId)) === "1"; } catch { return false; }
}

export function clearRecoveryPending(userId: string) {
  try { localStorage.removeItem(key(userId)); } catch { /* ignore */ }
}
