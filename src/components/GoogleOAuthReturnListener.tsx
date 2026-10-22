import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { supabase } from "@/integrations/supabase/client";
import { NATIVE_GOOGLE_RETURN_URL } from "@/lib/googleAuth";
import {
  appGoogleStartUrl,
  markGoogleSignInFinished,
  markGoogleSignInStarted,
  SUPABASE_CALLBACK_PREFIX,
} from "@/lib/appGoogleHandoff";
import { parseGoogleReturn } from "@/lib/googleReturn";
import { toast } from "@/hooks/use-toast";
import { tNow } from "@/lib/i18n/language";
import { reportProblem } from "@/lib/errorReport";

/**
 * Catches the Android return leg of "Sign in with Google" (see
 * src/lib/googleAuth.ts): Google -> Supabase -> com.bloomvoicenet.chat://
 * auth/google-return, which Android hands back to the app.
 *
 * Two ways the return arrives:
 * - the app was still open: Capacitor's `appUrlOpen` event;
 * - the phone closed the app while the Google page was open (common on
 *   Xiaomi, Tecno, Infinix): the return link STARTS the app, and only
 *   `App.getLaunchUrl()` has it. Missing this case left people on the
 *   sign-in screen after tapping Continue.
 *
 * Supabase can send the session as tokens after `#` (implicit flow) or as a
 * `?code=` (PKCE); both are handled. A failed return shows a plain message
 * instead of silently going back to sign in.
 */
let lastHandled = "";

export default function GoogleOAuthReturnListener() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const fail = () => {
      toast({ title: tNow("gr.failTitle"), description: tNow("gr.failBody"), variant: "destructive" });
      navigate("/login", { replace: true });
    };

    const handle = (url: string | undefined) => {
      if (!url || url === lastHandled) return;
      // Android gave the app Google's answer meant for Supabase (a link rule
      // in APKs up to 1.9). Without this, Supabase never got it and people
      // were left on the sign-in screen. Hand it back to the browser, marked
      // as an app sign-in, so the result comes back to the app.
      if (url.startsWith(`${SUPABASE_CALLBACK_PREFIX}?`)) {
        lastHandled = url;
        reportProblem("google-return", "Google answer reached the app; passed back to the browser");
        markGoogleSignInStarted();
        void Browser.open({ url: appGoogleStartUrl(url) }).catch((e) => {
          reportProblem("google-return", e);
          fail();
        });
        return;
      }
      if (!url.startsWith(NATIVE_GOOGLE_RETURN_URL)) return;
      lastHandled = url;
      markGoogleSignInFinished();
      void (async () => {
        try {
          await Browser.close().catch(() => {});
          const ret = parseGoogleReturn(url);
          if (ret.kind === "tokens") {
            const { error } = await supabase.auth.setSession({
              access_token: ret.accessToken,
              refresh_token: ret.refreshToken,
            });
            if (error) throw error;
          } else if (ret.kind === "code") {
            const { error } = await supabase.auth.exchangeCodeForSession(ret.code);
            if (error) throw error;
          } else {
            // Closing Google's screen is a choice, not a problem: just go back.
            if (ret.kind === "error" && /access_denied|cancel/i.test(ret.message)) {
              navigate("/login", { replace: true });
              return;
            }
            reportProblem("google-return", ret.kind === "error" ? ret.message : "no session in return link");
            fail();
            return;
          }
          navigate("/auth/google-return", { replace: true });
        } catch (e) {
          reportProblem("google-return", e);
          fail();
        }
      })();
    };

    const subPromise = CapacitorApp.addListener("appUrlOpen", ({ url }) => handle(url));
    // Cold start: the return link launched the app.
    void CapacitorApp.getLaunchUrl()
      .then((launch) => handle(launch?.url))
      .catch(() => {});
    return () => {
      void subPromise.then((sub) => sub.remove());
    };
  }, [navigate]);

  return null;
}
