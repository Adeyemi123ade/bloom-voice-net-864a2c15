import { Capacitor, SystemBars, SystemBarsStyle, SystemBarType } from "@capacitor/core";

/**
 * Light (white) buttons on the phone's own navigation bar, which sits on
 * ChiChat's deep green. The status bar at the top stays dark-on-light.
 *
 * The native code sets this at start up too, but on Android 15 Capacitor's
 * own system-bars handling follows the phone's light theme (dark buttons)
 * and can win, which left the buttons nearly invisible on the green. Setting
 * it from here works on any Capacitor 8 build, without rebuilding the app,
 * and is repeated whenever the app comes back to the front.
 */
export function applySystemBarStyle(): void {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return;
  const apply = () => {
    SystemBars.setStyle({ style: SystemBarsStyle.Dark, bar: SystemBarType.NavigationBar }).catch(() => {});
    SystemBars.setStyle({ style: SystemBarsStyle.Light, bar: SystemBarType.StatusBar }).catch(() => {});
  };
  apply();
  // After a system dialog, the lock screen or another app, Android can
  // restore the default look: put it back.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") window.setTimeout(apply, 50);
  });
  window.addEventListener("focus", () => window.setTimeout(apply, 50));
}
