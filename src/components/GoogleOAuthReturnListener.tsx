import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { supabase } from "@/integrations/supabase/client";
import { NATIVE_GOOGLE_RETURN_URL } from "@/lib/googleAuth";

/**
 * Catches the native Android return leg of "Sign in with Google" (see
 * src/lib/googleAuth.ts). Capacitor fires `appUrlOpen` when Android routes a
 * `com.bloomvoicenet.chat://` URL back into the app (the custom-scheme
 * intent filter already declared in AndroidManifest.xml). Supabase's
 * implicit OAuth flow puts the session tokens in the URL fragment, and
 * because this never becomes a real `window.location` navigation, the
 * client's usual `detectSessionInUrl` parsing never sees it — so this
 * extracts the tokens itself and establishes the session directly via
 * `setSession`, then hands off to the existing /auth/google-return page for
 * the "existing user vs. finish registration" decision it already makes.
 * No-op on web, where the normal browser redirect handles all of this.
 * Mounted once, outside DeviceGate, so it's active regardless of auth state.
 */
export default function GoogleOAuthReturnListener() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const handle = (url: string) => {
      if (!url.startsWith(NATIVE_GOOGLE_RETURN_URL)) return;
      void (async () => {
        try {
          const hashIdx = url.indexOf("#");
          const params = new URLSearchParams(hashIdx !== -1 ? url.slice(hashIdx + 1) : "");
          const access_token = params.get("access_token");
          const refresh_token = params.get("refresh_token");
          await Browser.close().catch(() => {});
          if (!access_token || !refresh_token) {
            navigate("/login", { replace: true });
            return;
          }
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) {
            navigate("/login", { replace: true });
            return;
          }
          navigate("/auth/google-return", { replace: true });
        } catch {
          navigate("/login", { replace: true });
        }
      })();
    };

    const subPromise = CapacitorApp.addListener("appUrlOpen", ({ url }) => handle(url));
    return () => {
      void subPromise.then((sub) => sub.remove());
    };
  }, [navigate]);

  return null;
}
