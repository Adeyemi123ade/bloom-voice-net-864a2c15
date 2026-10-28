import { tNow } from "@/lib/i18n/language";
import { ReactNode, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { getDeviceId, getDeviceLabel } from "@/lib/deviceId";
import { getAppPlatform } from "@/lib/platform";
import {
  isDeviceVerifiedLocally,
  markDeviceVerified,
} from "@/lib/deviceVerified";
import { isRecoveryPending } from "@/lib/recoveryPending";
import { toast } from "@/hooks/use-toast";
import MobileFrame from "@/components/MobileFrame";
import {
  ADD_PHONE_PATH,
  checkMyPhone,
  isGoogleOnly,
  phoneKnownOnDevice,
} from "@/lib/phoneRequired";

// Accounts whose number the server confirmed since the app started.
const checkedThisStart = new Set<string>();

/**
 * Sits between AuthProvider and the routes. Whenever a user is signed in on
 * a protected page, BLOCKS rendering until the account is ready:
 *   - email confirmed, no unfinished password reset
 *   - a saved phone number (checked with the server; see phoneRequired.ts)
 *       none, Google-only account → /register to finish the form
 *       none, any other account   → /add-phone
 *       server unreachable        → "couldn't check" with Try again, unless
 *                                   this device already saw the number
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
  // Where an account without a phone number adds it.
  ADD_PHONE_PATH,
  // Public documentation — must render for a signed-out visitor (the
  // Register/Login page links here) and must never trigger the
  // auth-loading/redirect logic below.
  "/terms",
  "/privacy",
  // Shown after a suspended account was signed out.
  "/account-suspended",
  // Public page for deleting an account (Google Play asks for this link).
  "/delete-account",
]);

export default function DeviceGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isExempt = EXEMPT_ROUTES.has(location.pathname);
  const [verified, setVerified] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (loading) return;
    if (isExempt) return;
    if (!user) {
      setVerified(false);
      // A call answered on a phone that is no longer signed in (a ring that
      // arrived late, after signing out): say the call isn't available here
      // instead of sending the person to the sign-in screen.
      if (isCallPath(location.pathname)) return;
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
    // Every account has a phone number before it uses the app: friends find
    // each other by it. Checked with the server, never assumed. A number
    // already seen on this device lets the app open at once (offline too);
    // the server is still asked once per app start.
    if (checking) return;
    const known = phoneKnownOnDevice(user.id);
    if (known) {
      markDeviceVerified(user.id);
      setVerified(true);
      if (checkedThisStart.has(user.id)) return;
    }

    let cancelled = false;
    (async () => {
      setChecking(true);
      setCheckFailed(false);
      try {
        const result = await checkMyPhone(user.id);
        if (cancelled) return;
        if (result === "has-phone") {
          checkedThisStart.add(user.id);
          markDeviceVerified(user.id);
          setVerified(true);
          return;
        }
        if (result === "no-phone") {
          setVerified(false);
          if (isGoogleOnly(user)) {
            // A Google sign-in that stopped before the form: finish it there
            // (phone, password and the policy, as for everyone else).
            const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
            navigate("/register", {
              replace: true,
              state: {
                prefill: {
                  email: user.email ?? "",
                  name: String(meta.full_name ?? meta.name ?? ""),
                  googleVerified: true,
                },
              },
            });
          } else {
            navigate(ADD_PHONE_PATH, { replace: true });
          }
          return;
        }
        // Couldn't reach the server. With a number already seen here, carry
        // on; otherwise say so and offer to try again. Never let an account
        // in on a guess.
        if (!known) setCheckFailed(true);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, location.pathname, isExempt, retry]);

  // Public/auth routes always render.
  if (isExempt) return <>{children}</>;

  // Still figuring out auth state — render nothing rather than the protected page.
  if (loading) return <LoadingShell label={tNow("common.loading")} />;

  // No user — the effect above is already navigating to /login; render nothing
  // in the meantime rather than the protected page.
  if (!user && isCallPath(location.pathname)) {
    return <CallUnavailable onOk={() => navigate("/", { replace: true })} />;
  }
  if (!user) return <LoadingShell label={tNow("dg.signingIn")} />;

  // Session exists but the email OTP hasn't been confirmed yet — never render
  // the protected screen; the effect above is already navigating away.
  if (!user.email_confirmed_at) return <LoadingShell label={tNow("dg.signingIn")} />;

  // Session came from an unfinished password reset — same story.
  if (isRecoveryPending(user.id)) return <LoadingShell label={tNow("dg.signingIn")} />;

  // Account check couldn't reach the server and this device hasn't seen a
  // number for this account yet: plain words and a way to try again.
  if (checkFailed && !verified) {
    return (
      <CheckFailed
        onRetry={() => { setCheckFailed(false); setRetry((n) => n + 1); }}
      />
    );
  }

  // The phone number check (above) must pass before any protected screen.
  if (!verified) return <LoadingShell label={tNow("dg.signingIn")} />;

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

function CheckFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <MobileFrame>
      <div className="h-full w-full flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <p className="text-base font-medium text-foreground">{tNow("ph.checkFailTitle")}</p>
        <p className="text-sm text-muted-foreground">{tNow("ph.checkFailBody")}</p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full bg-primary px-8 py-2 text-sm font-medium text-primary-foreground"
        >
          {tNow("common.tryAgain")}
        </button>
      </div>
    </MobileFrame>
  );
}

function isCallPath(path: string): boolean {
  return path.startsWith("/call/");
}

function CallUnavailable({ onOk }: { onOk: () => void }) {
  return (
    <MobileFrame>
      <div className="h-full w-full flex flex-col items-center justify-center gap-6 bg-background px-6">
        <p className="text-base text-foreground text-center">{tNow("cs.notAvailable")}</p>
        <button
          type="button"
          onClick={onOk}
          className="rounded-full bg-primary px-8 py-2 text-sm font-medium text-primary-foreground"
        >
          {tNow("common.ok")}
        </button>
      </div>
    </MobileFrame>
  );
}
