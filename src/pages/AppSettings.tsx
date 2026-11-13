import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import AppSwitchList from "@/components/AppSwitchList";
import { useBackNavigation } from "@/hooks/useBackNavigation";
import { useLanguage } from "@/lib/i18n/context";

/** Settings > App settings: one switch per item, nothing else. */
export default function AppSettings() {
  const { showBackArrow, goBack } = useBackNavigation("/settings");
  const { t } = useLanguage();

  useEffect(() => {
    document.title = `${t("appSettings.title")} — Chichat`;
  }, [t]);

  return (
    <MobileFrame>
      <div className="h-full w-full flex flex-col bg-background overflow-y-auto">
        <div className="px-2 pt-4 pb-3 flex items-center gap-2 border-b border-border sticky top-0 bg-background z-10">
          {showBackArrow && (
            <button
              onClick={goBack}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
          )}
          <h1 className={`text-base font-semibold text-foreground ${showBackArrow ? "" : "pl-2"}`}>{t("appSettings.title")}</h1>
        </div>

        <div className="px-4 py-4">
          <AppSwitchList />
        </div>
      </div>
    </MobileFrame>
  );
}
