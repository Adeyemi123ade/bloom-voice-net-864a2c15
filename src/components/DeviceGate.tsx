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
      // Not signed in but on a protected route — let downstream auth guards
      // handle the redirect. The gate just stays out of the way.
      setVerified(false);
      return;
    }
    if (isDeviceVerifiedLocally(user.id)) {
      setVerified(true);
      return;
    }
    if (checking) return;

    let cancelled = false;
    (async () => {
      setChecking(true);
      setVerified(false);
      try {
        // Step 1: Google session check.
        const { data: googleCheck, error: gErr } = await supabase.functions.invoke("check-google-signup");
        if (cancelled) return;
        if (!gErr && googleCheck) {
          if (googleCheck.allowed === false && googleCheck.pending_registration) {
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
          if (googleCheck.allowed === true && googleCheck.is_google) {
            markDeviceVerified(user.id);
            setVerified(true);
            return;
          }
        }

        // Step 2: device gate (email/password sign-ins).
        const { data, error } = await supabase.functions.invoke("request-device-otp", {
          body: {
            device_id: getDeviceId(),
            device_label: getDeviceLabel(),
            platform: getAppPlatform(),
          },
        });
        if (cancelled) return;
        if (error || !data) {
          // Hard fail: do NOT grant access. Sign the user out and bounce
          // them back to login with a clear message.
          await supabase.auth.signOut();
          toast({
            title: "Couldn't verify this device",
            description: "We couldn't send a verification code. Please check your connection and sign in again.",
            variant: "destructive",
          });
          navigate("/login", { replace: true });
          return;
        }
        if (data.reason === "trusted") {
          markDeviceVerified(user.id);
          setVerified(true);
          return;
        }
        // Verification required — block access and route to the OTP screen.
        navigate("/verify-device", {
          replace: true,
          state: {
            reason: data.reason,
            otherDisplayName: data.other_display_name ?? null,
          },
        });
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

  // No user — let the underlying route's own guards handle redirect; render nothing.
  if (!user) return <LoadingShell label="Signing you in…" />;

  // Have a user but device not yet cleared — show a neutral loader so the
  // protected screen NEVER appears before verification finishes.
  if (!verified) return <LoadingShell label="Verifying this device…" />;

  return <>{children}</>;
}

function LoadingShell({ label }: { label: string }) {
  return (
    <MobileFrame>
      <div className="h-full w-full flex flex-col items-center justify-center bg-background gap-4 px-6">
        <div className="h-10 w-10 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
        <p className="text-base text-muted-foreground">{label}</p>
      </div>
    </MobileFrame>
  );
}
