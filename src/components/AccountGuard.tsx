import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchMyAccountStatus,
  leaveSuspendedAccount,
  onAccountCheckRequested,
} from "@/lib/accountStatus";

/**
 * A suspended account is signed out on this device as soon as the app
 * checks: after sign-in, when the app comes back to the screen, and right
 * after the server refuses something because of the suspension.
 */
export default function AccountGuard() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let last = 0;
    const check = async (force = false) => {
      if (!force && Date.now() - last < 30_000) return;
      last = Date.now();
      if ((await fetchMyAccountStatus()) === "suspended") await leaveSuspendedAccount();
    };
    void check(true);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    const off = onAccountCheckRequested(() => void check(true));
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      off();
    };
  }, [userId]);

  return null;
}
