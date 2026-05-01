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

/**
 * Sits between AuthProvider and the routes. Whenever a user is signed in,
 * checks the device-binding state:
 *  - trusted device  -> nothing happens
 *  - new device      -> sends an email code, navigates to /verify-device
 *  - takeover (different account already on this phone)
 *                    -> shows confirm dialog, then sends code + navigates
 */
export default function DeviceGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    // Pages that ARE the gate or are public auth pages — don't run.
    const exempt = [
      "/auth/google-return",
      "/verify-device",
      "/verify-email",
      "/verify-reset-code",
      "/reset-password",
      "/forgot-password",
      "/login",
      "/register",
      "/",
    ];
    if (exempt.includes(location.pathname)) return;
    if (isDeviceVerifiedLocally(user.id)) return;
    if (checking) return;

    let cancelled = false;
    (async () => {
      setChecking(true);
      try {
        // Step 1: if this is a Google session, decide what to do.
        //   - existing user with finished profile → straight through (skip
        //     the device OTP entirely, Google already verified the email).
        //   - new user who hasn't finished the form → bounce to /register
        //     with details pre-filled. Keep the session alive.
        const { data: googleCheck } = await supabase.functions.invoke("check-google-signup");
        if (cancelled) return;
        if (googleCheck) {
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
            // Trusted Google sign-in: no device OTP.
            markDeviceVerified(user.id);
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
          toast({
            title: "Couldn't verify this device",
            description: "Please check your connection and try signing in again.",
            variant: "destructive",
          });
          return;
        }
        if (data.reason === "trusted") {
          markDeviceVerified(user.id);
          return;
        }
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
  }, [user, loading, location.pathname]);

  return <>{children}</>;
}
