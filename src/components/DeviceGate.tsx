import { ReactNode, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getDeviceId, getDeviceLabel } from "@/lib/deviceId";
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
        const { data, error } = await supabase.functions.invoke("request-device-otp", {
          body: { device_id: getDeviceId(), device_label: getDeviceLabel() },
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
