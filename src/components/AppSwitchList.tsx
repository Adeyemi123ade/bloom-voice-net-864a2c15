import { useCallback, useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import BatteryHelpDialog from "@/components/BatteryHelpDialog";
import { type AppSwitches, changeAppSwitch, readAppSwitches } from "@/lib/appSettings";
import { isVoiceTranscribeEnabled, setVoiceTranscribeEnabled } from "@/lib/transcriptionPrefs";
import { useLanguage } from "@/lib/i18n/context";

/**
 * The App settings switches (notifications, show calls over other apps,
 * autostart, run in background, voice note transcription). Used by
 * Settings > App settings and by the one-time step at the end of
 * registration, so both always look and behave the same.
 */
export default function AppSwitchList() {
  const [switches, setSwitches] = useState<AppSwitches | null>(null);
  const [transcribe, setTranscribe] = useState(() => isVoiceTranscribeEnabled());
  const [batteryHelp, setBatteryHelp] = useState(false);
  const { t } = useLanguage();

  const refresh = useCallback(async () => {
    setSwitches(await readAppSwitches());
  }, []);

  useEffect(() => {
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
    if (name === "background" && on) {
      setBatteryHelp(true);
      return;
    }
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
    <>
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
      <BatteryHelpDialog open={batteryHelp} onOpenChange={setBatteryHelp} onOpened={() => void refresh()} />
    </>
  );
}
