import { PushNotifications } from "@capacitor/push-notifications";
import {
  getCallReadiness,
  isAndroidNative,
  openCallSettings,
} from "@/lib/nativeCalls";

/**
 * The switches on Settings > App settings. Each shows the phone's real
 * setting; Android doesn't let an app change these itself, so turning one on
 * or off opens the phone's own prompt or setting for it.
 */
export type AppSwitches = {
  notifications: boolean;
  overApps: boolean;
  /** null: this phone has no Autostart setting (only Xiaomi and similar). */
  autostart: boolean | null;
  background: boolean;
};

const AUTOSTART_KEY = "chichat.autostart_on";

function remembered(key: string): boolean | null {
  try {
    const v = localStorage.getItem(key);
    return v === null ? null : v === "1";
  } catch {
    return null;
  }
}

function remember(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** Null in the browser (these switches exist only in the Android app). */
export async function readAppSwitches(): Promise<AppSwitches | null> {
  if (!isAndroidNative()) return null;
  const r = await getCallReadiness();
  if (!r) return null;
  const xiaomi = !!r.xiaomi;
  return {
    notifications: r.notifications !== false,
    // Xiaomi keeps its own "pop-up windows in the background" permission;
    // elsewhere this is Android's full-screen call permission.
    overApps: xiaomi ? r.backgroundPopups !== false && r.lockScreen !== false : r.fullScreen !== false,
    // Xiaomi doesn't let apps read Autostart, so this is the user's last
    // choice here (on by default).
    autostart: xiaomi ? remembered(AUTOSTART_KEY) ?? true : null,
    background: !!r.battery,
  };
}

export async function changeAppSwitch(name: keyof AppSwitches, turnOn: boolean, current: AppSwitches): Promise<void> {
  if (name === "notifications") {
    if (turnOn) {
      const perm = await PushNotifications.requestPermissions().catch(() => null);
      if (perm?.receive === "granted") return;
    }
    await openCallSettings("notifications");
  } else if (name === "overApps") {
    const r = await getCallReadiness();
    await openCallSettings(r?.xiaomi ? "lockScreen" : "fullScreen");
  } else if (name === "autostart") {
    if (current.autostart === null) return;
    remember(AUTOSTART_KEY, turnOn);
    await openCallSettings("autostart");
  } else if (name === "background") {
    // Turning on is explained first (BatteryHelpDialog on the screen).
    if (!turnOn) await openCallSettings("app");
  }
}

