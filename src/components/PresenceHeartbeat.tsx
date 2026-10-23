import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { startPresence } from "@/lib/presenceHeartbeat";

/** Keeps "online" and "last seen" up to date on every screen while signed in. */
export default function PresenceHeartbeat() {
  const { user } = useAuth();
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    return startPresence(userId);
  }, [userId]);
  return null;
}
