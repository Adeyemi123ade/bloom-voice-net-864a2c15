// Persists the email awaiting signup-OTP confirmation so the verification
// screen survives a back-navigation, refresh, or app restart. Without this,
// VerifyEmail.tsx only knew the email via router navigation state, which is
// lost the moment the user leaves the page any way other than clicking
// "Verify" — leaving a real, still-valid code with nowhere to be entered.
//
// Uses localStorage, not sessionStorage, for the same reason as
// recoveryPending.ts: a gate that only lived in the current tab/session
// would be bypassed by exactly the reload/back-navigation this exists to
// survive.
const KEY = "chichat.pending_verify_email";

export function markVerifyEmailPending(email: string) {
  try { localStorage.setItem(KEY, email); } catch { /* ignore */ }
}

export function getVerifyEmailPending(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export function clearVerifyEmailPending() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
