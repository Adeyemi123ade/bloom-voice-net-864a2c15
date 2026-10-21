import { useEffect, useState } from "react";
import { toast } from "@/hooks/use-toast";
import { tNow } from "@/lib/i18n/language";

/** True only when the phone reports no network at all. */
export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** Plain "No internet connection / Check your connection" notice. */
export function showOfflineNotice(): void {
  toast({ title: tNow("login.offlineTitle"), description: tNow("login.offlineBody"), variant: "destructive" });
}

/** Re-renders when the phone goes offline or comes back online. */
export function useIsOnline(): boolean {
  const [online, setOnline] = useState(() => !isOffline());
  useEffect(() => {
    const update = () => setOnline(!isOffline());
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}
