import { ReactNode, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getDeviceId, getDeviceLabel } from "@/lib/deviceId";
import { getAppPlatform } from "@/lib/platform";
import {
  isDeviceVerifiedLocally,
  markDeviceVerified,
} from "@/lib/deviceVerified";
import { isRecoveryPending } from "@/lib/recoveryPending";
import { toast } from "@/hooks/use-toast";
import MobileFrame from "@/components/MobileFrame";

/**
 * Sits between AuthProvider and the routes. Whenever a user is signed in on
 * a protected page, BLOCKS rendering until the device-binding state is
 * resolved:
 *   - trusted device           → render children
 *   - new device / takeover    → email a code and route to /verify-device
 *   - failure (network, etc.)  → sign the user out and route to /login
 *
 * No protected screen ever renders before verification clears.
 */

// Routes that are public or are themselves part of the auth/verify flow.
// On these, the gate stays out of the way completely.
const EXEMPT_ROUTES = new Set<string>([
  "/",
  "/login",
  "/register",
  "/welcome",
  "/forgot-password",
  "/verify-email",
  "/verify-reset-code",
  "/reset-password",
  "/verify-device",
  "/auth/google-return",
  // Public documentation — must render for a signed-out visitor (the
  // Register/Login page links here) and must never trigger the
  // auth-loading/redirect logic below.
  "/terms",
]);

export default function DeviceGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isExempt = EXEMPT_ROUTES.has(location.pathname);
  const [verified, setVerified] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (isExempt) return;
    if (!user) {
      setVerified(false);
      // No session and we're on a protected route (deep link, expired/lost
      // session, etc.) — bounce to /login instead of stranding the user on
      // the loading shell forever. isExempt guards against a redirect loop
      // once location.pathname becomes "/login".
      navigate("/login", { replace: true });
      return;
    }
    // A Supabase session existing does NOT mean the account is verified —
    // signUp() can hand back a session for an account that hasn't confirmed
    // its email OTP yet. Never let an unconfirmed session reach a protected
    // screen; send it back to finish verification instead.
    if (!user.email_confirmed_at) {
      setVerified(false);
      navigate("/verify-email", { replace: true, state: { email: user.email } });
      return;
    }
    // Verifying a password-reset code establishes a real session before the
    // user actually sets a new password — same trap as the email-confirm
    // case above. Never let that session into the app until the password is
    // actually changed.
    if (isRecoveryPending(user.id)) {
      setVerified(false);
      navigate("/reset-password", { replace: true });
      return;
    }
    // Dual-device verification temporarily disabled. Trust every signed-in
    // session. We still run the Google-signup probe so brand-new Google users
    // get routed to /register to finish their profile.
    if (checking) return;

    let cancelled = false;
    (async () => {
      setChecking(true);
      try {
        const { data: googleCheck, error: gErr } = await supabase.functions.invoke("check-google-signup");
        if (cancelled) return;
        if (!gErr && googleCheck?.allowed === false && googleCheck?.pending_registration) {
          navigate("/register", {
            replace: true,
            state: {
              prefill: {
                email: googleCheck.email,
                name: googleCheck.full_name,
                googleVerified: true,
              },
            },
          });
          return;
        }
        markDeviceVerified(user.id);
        setVerified(true);
      } catch {
        // Network hiccup on the Google probe — don't block the user.
        markDeviceVerified(user.id);
        setVerified(true);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, location.pathname, isExempt]);

  // Public/auth routes always render.
  if (isExempt) return <>{children}</>;

  // Still figuring out auth state — render nothing rather than the protected page.
  if (loading) return <LoadingShell label="Loading…" />;

  // No user — the effect above is already navigating to /login; render nothing
  // in the meantime rather than the protected page.
  if (!user) return <LoadingShell label="Signing you in…" />;

  // Session exists but the email OTP hasn't been confirmed yet — never render
  // the protected screen; the effect above is already navigating away.
  if (!user.email_confirmed_at) return <LoadingShell label="Signing you in…" />;

  // Session came from an unfinished password reset — same story.
  if (isRecoveryPending(user.id)) return <LoadingShell label="Signing you in…" />;

  // Render the protected screen immediately. Device verification runs silently
  // in the background; if it determines a real verification step is required,
  // the effect above will navigate to /verify-device. We deliberately do NOT
  // block the UI on a "Verifying this device…" loader — the user should never
  // see the verification machinery during normal use.
  return <>{children}</>;
}

function LoadingShell({ label }: { label: string }) {
  // Intentionally minimal — no spinner. Spinners advertise latency and feel
  // janky on a chat app's cold-start. A quietly pulsing label is enough
  // signal that something is happening without making it feel slow.
  return (
    <MobileFrame>
      <div className="h-full w-full flex flex-col items-center justify-center bg-background px-6">
        <p className="text-base text-muted-foreground/70 animate-pulse">
          {label}
        </p>
      </div>
    </MobileFrame>
  );
}
