import { useEffect } from "react";
import MobileFrame from "@/components/MobileFrame";
import BrandHero from "@/components/BrandHero";
import { Button } from "@/components/ui/button";
import { authStyles } from "@/components/auth/authStyles";
import { useLanguage } from "@/lib/i18n/context";
import { appReturnLink } from "@/lib/appGoogleHandoff";

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
    window.location.href = link;
  }, [link]);

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
