import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { clearChatCaches } from "@/lib/chat/chatCache";
import { clearSafetyCache } from "@/lib/safety";
import { clearMatchCaches } from "@/lib/contactMatchCache";
import { keepSameUser } from "@/lib/sameUser";

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /**
   * True only after a real sign out (the user signed out, or the session
   * was revoked). Not set when the session just couldn't be read in time.
   */
  signedOut: boolean;
}

const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  loading: true,
  signedOut: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    loading: true,
    signedOut: false,
  });

  useEffect(() => {
    let resolved = false;

    // IMPORTANT: subscribe BEFORE calling getSession to avoid missing events.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      resolved = true;
      setState((st) => ({
        session,
        user: keepSameUser(st.user, session?.user),
        loading: false,
        signedOut: event === "SIGNED_OUT",
      }));
      if (event === "SIGNED_OUT") {
        // Saved chats on this device go with the account.
        clearChatCaches();
        clearMatchCaches();
        clearSafetyCache();
        try {
          localStorage.removeItem("chichat:acceptedChats");
        } catch {
          /* ignore */
        }
        // Wipe per-user device-verified / recovery-pending flags so next
        // sign-in re-checks the gate instead of inheriting stale state.
        try {
          for (const storage of [localStorage, sessionStorage]) {
            const keys = Object.keys(storage);
            for (const k of keys) {
              if (
                k.startsWith("chichat.device_verified.") ||
                k.startsWith("chichat.recovery_pending.")
              ) {
                storage.removeItem(k);
              }
            }
          }
        } catch { /* ignore */ }
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      resolved = true;
      setState((st) => ({ ...st, session, user: keepSameUser(st.user, session?.user), loading: false }));
    }).catch(() => {
      resolved = true;
      setState((st) => ({ ...st, session: null, user: null, loading: false }));
    });

    // Hard safety net: if neither getSession nor onAuthStateChange resolves
    // within 8s (network stalled, storage corrupt, etc.), fall back to a
    // signed-out state so the UI never hangs on "Signing you in…".
    const failsafe = window.setTimeout(() => {
      if (!resolved) {
        setState((st) => ({ ...st, session: null, user: null, loading: false }));
      }
    }, 8000);

    return () => {
      window.clearTimeout(failsafe);
      sub.subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
