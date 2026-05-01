import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    loading: true,
  });

  useEffect(() => {
    let resolved = false;

    // IMPORTANT: subscribe BEFORE calling getSession to avoid missing events.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      resolved = true;
      setState({ session, user: session?.user ?? null, loading: false });
      if (event === "SIGNED_OUT") {
        // Wipe per-user device-verified flags so next sign-in re-checks the gate.
        try {
          for (const storage of [localStorage, sessionStorage]) {
            const keys = Object.keys(storage);
            for (const k of keys) {
              if (k.startsWith("chichat.device_verified.")) storage.removeItem(k);
            }
          }
        } catch { /* ignore */ }
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      resolved = true;
      setState({ session, user: session?.user ?? null, loading: false });
    }).catch(() => {
      resolved = true;
      setState({ session: null, user: null, loading: false });
    });

    // Hard safety net: if neither getSession nor onAuthStateChange resolves
    // within 8s (network stalled, storage corrupt, etc.), fall back to a
    // signed-out state so the UI never hangs on "Signing you in…".
    const failsafe = window.setTimeout(() => {
      if (!resolved) {
        setState({ session: null, user: null, loading: false });
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
