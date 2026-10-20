import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import { Switch } from "@/components/ui/switch";
import { useBackNavigation } from "@/hooks/useBackNavigation";
import { type AppSwitches, changeAppSwitch, readAppSwitches } from "@/lib/appSettings";
import { isVoiceTranscribeEnabled, setVoiceTranscribeEnabled } from "@/lib/transcriptionPrefs";
import { useLanguage } from "@/lib/i18n/context";

/** Settings > App settings: one switch per item, nothing else. */
export default function AppSettings() {
  const { showBackArrow, goBack } = useBackNavigation("/settings");
  const [switches, setSwitches] = useState<AppSwitches | null>(null);
  const [transcribe, setTranscribe] = useState(() => isVoiceTranscribeEnabled());
  const { t } = useLanguage();

  const refresh = useCallback(async () => {
    setSwitches(await readAppSwitches());
  }, []);

  useEffect(() => {
    document.title = "App settings — Chichat";
    void refresh();
    // Coming back from the phone's own settings: show what's set now.
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refresh]);

  const flip = (name: keyof AppSwitches) => async (on: boolean) => {
    if (!switches) return;
    if (name === "autostart") setSwitches({ ...switches, autostart: on });
    await changeAppSwitch(name, on, switches);
    void refresh();
  };

  const rows: { key: string; label: string; checked: boolean; onChange: (on: boolean) => void }[] = [];
  if (switches) {
    rows.push({ key: "notifications", label: t("appSettings.notifications"), checked: switches.notifications, onChange: flip("notifications") });
    rows.push({ key: "overApps", label: t("appSettings.overApps"), checked: switches.overApps, onChange: flip("overApps") });
    if (switches.autostart !== null) {
      rows.push({ key: "autostart", label: t("appSettings.autostart"), checked: switches.autostart, onChange: flip("autostart") });
    }
    rows.push({ key: "background", label: t("appSettings.background"), checked: switches.background, onChange: flip("background") });
  }
  rows.push({
    key: "transcribe",
    label: t("appSettings.transcribe"),
    checked: transcribe,
    onChange: (on) => {
      setTranscribe(on);
      setVoiceTranscribeEnabled(on);
    },
  });

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
          <div className="rounded-2xl bg-card border border-border overflow-hidden">
            {rows.map((r, i) => (
              <label
                key={r.key}
                className={`flex items-center gap-3 px-4 min-h-[60px] cursor-pointer ${i ? "border-t border-border" : ""}`}
              >
                <span className="flex-1 text-base font-medium text-foreground">{r.label}</span>
                <Switch checked={r.checked} onCheckedChange={r.onChange} aria-label={r.label} />
              </label>
            ))}
          </div>
        </div>
      </div>
    </MobileFrame>
  );
}
