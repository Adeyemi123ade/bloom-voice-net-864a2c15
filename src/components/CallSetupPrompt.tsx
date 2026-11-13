import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import BatteryHelpDialog from "@/components/BatteryHelpDialog";
import { useAuth } from "@/hooks/useAuth";
import { type AppSwitches, changeAppSwitch, readAppSwitches } from "@/lib/appSettings";
import { useLanguage } from "@/lib/i18n/context";
import { isAndroidNative } from "@/lib/nativeCalls";
import { callSetupAskedKey as askedKey } from "@/lib/callSetup";

/**
 * Android app, once per account on this phone, after signing in or
 * registering: if something the phone needs to ring for calls while ChiChat
 * is closed or the screen is locked is switched off (notifications, showing
 * calls over other apps / on the lock screen, running in the background),
 * show those switches so the person can turn them on. Nothing is shown when
 * everything is already on. The same switches stay in Settings > App
 * settings. (Asked for on 2026-10-27, replacing the "no prompt" rule for
 * this one case: calls didn't wake locked phones without these.)
 */

const QUIET_PATHS = ["/call/", "/login", "/register", "/verify", "/welcome", "/setup", "/reset-password", "/forgot-password", "/auth/"];

function anyCallSwitchOff(s: AppSwitches | null): boolean {
  if (!s) return false;
  return !s.notifications || !s.overApps || !s.background || s.autostart === false;
}

export default function CallSetupPrompt() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const location = useLocation();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [switches, setSwitches] = useState<AppSwitches | null>(null);
  const [batteryHelp, setBatteryHelp] = useState(false);

  const quiet = location.pathname === "/" || QUIET_PATHS.some((p) => location.pathname.startsWith(p));

  const refresh = useCallback(async () => {
    setSwitches(await readAppSwitches());
  }, []);

  useEffect(() => {
    if (!userId || quiet || !isAndroidNative()) return;
    let asked = false;
    try {
      asked = localStorage.getItem(askedKey(userId)) === "1";
    } catch {
      asked = true; // can't remember it: don't risk asking every time
    }
    if (asked) return;
    let cancelled = false;
    // A moment after the chats appear, not on top of them loading.
    const timer = window.setTimeout(async () => {
      const s = await readAppSwitches();
      if (cancelled || !s) return;
      try {
        localStorage.setItem(askedKey(userId), "1");
      } catch {
        /* ignore */
      }
      if (!anyCallSwitchOff(s)) return;
      setSwitches(s);
      setOpen(true);
    }, 1500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [userId, quiet]);

  // Back from the phone's own settings: show what is on now.
  useEffect(() => {
    if (!open) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [open, refresh]);

  if (!open || !switches) return null;

  const flip = (name: keyof AppSwitches) => async (on: boolean) => {
    if (name === "background" && on) {
      setBatteryHelp(true);
      return;
    }
    if (name === "autostart") setSwitches({ ...switches, autostart: on });
    await changeAppSwitch(name, on, switches);
    void refresh();
  };

  const rows: { key: keyof AppSwitches; label: string; checked: boolean }[] = [
    { key: "notifications", label: t("appSettings.notifications"), checked: switches.notifications },
    { key: "overApps", label: t("appSettings.overApps"), checked: switches.overApps },
    ...(switches.autostart !== null
      ? [{ key: "autostart" as const, label: t("appSettings.autostart"), checked: switches.autostart }]
      : []),
    { key: "background", label: t("appSettings.background"), checked: switches.background },
  ];

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[340px]" data-testid="call-setup-prompt">
          <DialogHeader>
            <DialogTitle>{t("bat.title")}</DialogTitle>
          </DialogHeader>
          <div className="rounded-2xl border border-border overflow-hidden">
            {rows.map((r, i) => (
              <label
                key={r.key}
                className={`flex items-center gap-3 px-4 min-h-[56px] cursor-pointer ${i ? "border-t border-border" : ""}`}
              >
                <span className="flex-1 text-sm font-medium text-foreground">{r.label}</span>
                <Switch checked={r.checked} onCheckedChange={flip(r.key)} aria-label={r.label} />
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-2 w-full rounded-full bg-primary py-2.5 text-sm font-medium text-primary-foreground"
          >
            {anyCallSwitchOff(switches) ? t("bat.later") : t("common.ok")}
          </button>
        </DialogContent>
      </Dialog>
      <BatteryHelpDialog open={batteryHelp} onOpenChange={setBatteryHelp} onOpened={() => void refresh()} />
    </>
  );
}
