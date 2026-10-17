import { markRecoveryPending } from "@/lib/recoveryPending";

// A password-reset email can carry a link instead of (or as well as) a code.
// Opening that link signs the person in straight away, before they choose a
// new password, and nothing used to send them to /reset-password: they ended
// up in the app with a password they had forgotten and were locked out at the
// next sign in.
//
// This runs once, before the Supabase client reads and clears the address
// bar. If the address carries a recovery session, the account is marked
// recovery-pending, so Index / DeviceGate send it to /reset-password exactly
// like the code flow does (see recoveryPending.ts).
export function captureRecoveryLink() {
  try {
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : "";
    if (!hash) return;
    const params = new URLSearchParams(hash);
    if (params.get("type") !== "recovery") return;
    const token = params.get("access_token");
    if (!token) return;
    const payload = token.split(".")[1];
    if (!payload) return;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const sub = (JSON.parse(json) as { sub?: unknown }).sub;
    if (typeof sub === "string" && sub) markRecoveryPending(sub);
  } catch {
    /* malformed address: leave it to the Supabase client */
  }
}
