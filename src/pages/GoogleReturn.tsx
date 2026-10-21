import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import MobileFrame from "@/components/MobileFrame";
import BrandHero from "@/components/BrandHero";
import { Button } from "@/components/ui/button";
import { authStyles } from "@/components/auth/authStyles";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/i18n/context";
import { reportProblem } from "@/lib/errorReport";

type GoogleSignupCheck = {
  allowed?: boolean;
  pending_registration?: boolean;
  email?: string;
  full_name?: string;
};

type Outcome =
  | { kind: "existing" }
  | { kind: "new"; email: string; name: string }
  | { kind: "no-session" }
  | { kind: "unreachable" };

const RETRY_DELAYS_MS = [0, 1200, 2500];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Asks which kind of Google account this is. A short network hiccup must not
 * throw a person who really signed in back to the sign-in screen, so the
 * check is tried a few times before giving up.
 */
async function checkGoogleAccount(): Promise<Outcome> {
  // getSession() waits for the session being set up (address-bar tokens on
  // the web, or the app's setSession/exchange), so the check has it attached.
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) return { kind: "no-session" };
  let lastError: unknown = null;
  for (const delay of RETRY_DELAYS_MS) {
    if (delay) await wait(delay);
    const { data, error } = await supabase.functions.invoke<GoogleSignupCheck>("check-google-signup");
    if (!error && data) {
      if (data.allowed === false && data.pending_registration) {
        return { kind: "new", email: data.email ?? "", name: data.full_name ?? "" };
      }
      return { kind: "existing" };
    }
    lastError = error;
  }
  reportProblem("google-check", lastError ?? "check-google-signup failed");
  return { kind: "unreachable" };
}

/**
 * After Google: returning people go straight to their chats; new people go
 * to the registration form with their Google name and email filled in, to
 * add their phone and a password. If the account can't be checked, the
 * person stays signed in and can try again, or choose another way.
 */
export default function GoogleReturn() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [stuck, setStuck] = useState(false);
  const running = useRef(false);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setStuck(false);
    const outcome = await checkGoogleAccount();
    running.current = false;

    if (outcome.kind === "existing") {
      navigate("/home", { replace: true });
      return;
    }
    if (outcome.kind === "new") {
      toast({ title: t("gr.almost"), description: t("gr.almostBody") });
      navigate("/register", {
        replace: true,
        state: { prefill: { email: outcome.email, name: outcome.name, googleVerified: true } },
      });
      return;
    }
    if (outcome.kind === "no-session") {
      reportProblem("google-check", "no session after Google");
      toast({ title: t("gr.failTitle"), description: t("gr.failBody"), variant: "destructive" });
      navigate("/login", { replace: true });
      return;
    }
    setStuck(true);
  }, [navigate, t]);

  useEffect(() => {
    void run();
  }, [run]);

  const otherWay = async () => {
    await supabase.auth.signOut({ scope: "local" });
    navigate("/login", { replace: true });
  };

  return (
    <MobileFrame>
      <div className="h-full w-full flex flex-col items-stretch justify-center gap-4 bg-background px-6">
        <BrandHero message={stuck ? t("gr.failTitle") : t("gr.checking")} />
        {stuck ? (
          <>
            <Button className={authStyles.primaryButton} onClick={() => void run()}>
              {t("common.tryAgain")}
            </Button>
            <Button variant="outline" className={authStyles.secondaryButton} onClick={() => void otherWay()}>
              {t("gr.other")}
            </Button>
          </>
        ) : null}
      </div>
    </MobileFrame>
  );
}
