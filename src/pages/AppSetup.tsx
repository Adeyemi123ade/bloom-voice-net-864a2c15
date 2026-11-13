import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import MobileFrame from "@/components/MobileFrame";
import AppSwitchList from "@/components/AppSwitchList";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/lib/i18n/context";
import { markCallSetupAsked } from "@/lib/callSetup";

/**
 * Android app, once, at the end of registration: the same switches as
 * Settings > App settings. The person can leave them on, or change any of
 * them here or later in Settings. The after-sign-in prompt is not shown again
 * for this account on this phone.
 */
export default function AppSetup() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = `${t("appSettings.title")} — Chichat`;
  }, [t]);

  useEffect(() => {
    if (user?.id) markCallSetupAsked(user.id);
  }, [user?.id]);

  return (
    <MobileFrame>
      <div className="h-full w-full flex flex-col bg-background overflow-y-auto">
        <div className="px-6 pt-12 pb-3">
          <h1 className="text-2xl font-bold text-foreground">{t("appSettings.title")}</h1>
        </div>
        <div className="px-4 py-2">
          <AppSwitchList />
        </div>
        <div className="mt-auto px-6 pb-8 pt-6">
          <Button
            onClick={() => navigate("/home", { replace: true })}
            className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg"
          >
            {t("wl.continue")}
          </Button>
        </div>
      </div>
    </MobileFrame>
  );
}
