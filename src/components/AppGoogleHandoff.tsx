import { useEffect } from "react";
import MobileFrame from "@/components/MobileFrame";
import BrandHero from "@/components/BrandHero";
import { Button } from "@/components/ui/button";
import { authStyles } from "@/components/auth/authStyles";
import { useLanguage } from "@/lib/i18n/context";
import { appReturnLink } from "@/lib/appGoogleHandoff";
import { reportProblem } from "@/lib/errorReport";

/**
 * Shown in the phone's browser tab after Google, when the sign-in was started
 * in the ChiChat app: sends the result back to the app. Opening the app
 * happens by itself where the browser allows it; the button covers browsers
 * that only open apps after a tap.
 */
export default function AppGoogleHandoff({ result }: { result: string }) {
  const { t } = useLanguage();
  const link = appReturnLink(result);

  useEffect(() => {
    // Which answer the browser tab got (never the tokens themselves), so a
    // failing sign-in can be traced step by step on the admin page.
    const r = new URLSearchParams(result);
    const what = r.has("access_token") ? "tokens" : r.has("code") ? "code" : `error: ${r.get("error_description") ?? r.get("error") ?? "?"}`;
    reportProblem("google-trace", `browser tab: got ${what}`);
    window.location.href = link;
  }, [link, result]);

  return (
    <MobileFrame>
      <div className="h-full w-full flex flex-col justify-center gap-5 bg-background px-6">
        <BrandHero message={t("gh.title")} />
        <p className="text-sm text-muted-foreground text-center">{t("gh.body")}</p>
        <Button asChild className={authStyles.primaryButton}>
          <a href={link}>{t("gh.cta")}</a>
        </Button>
      </div>
    </MobileFrame>
  );
}
