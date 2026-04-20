import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/** Returns whether the current user shares their last-seen with others. Defaults to true. */
export function useMyPrivacy(): { showLastSeen: boolean; loading: boolean; refresh: () => void } {
  const { user } = useAuth();
  const [showLastSeen, setShowLastSeen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("show_last_seen")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setShowLastSeen((data as { show_last_seen?: boolean } | null)?.show_last_seen ?? true);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, tick]);

  return { showLastSeen, loading, refresh: () => setTick((t) => t + 1) };
}
