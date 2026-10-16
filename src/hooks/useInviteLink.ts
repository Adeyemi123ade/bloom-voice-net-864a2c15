import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { firstNameOf, inviteLink } from "@/lib/invite";

/** The signed-in person's personal invite link (with their first name). */
export function useInviteLink(): string {
  const { user } = useAuth();
  const meta = user?.user_metadata as { full_name?: string; name?: string } | undefined;
  const fromSignUp = firstNameOf(meta?.full_name ?? meta?.name);
  const [fromProfile, setFromProfile] = useState<string | null>(null);

  useEffect(() => {
    if (!user || fromSignUp) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setFromProfile(firstNameOf(data?.display_name));
      });
    return () => {
      cancelled = true;
    };
  }, [user, fromSignUp]);

  return inviteLink(fromSignUp ?? fromProfile);
}
