// Bridge to the native ChiChatCalls Capacitor plugin (Android only).
// Safely no-ops on web / iOS so the rest of the app doesn't need platform checks.
import { Capacitor, registerPlugin } from "@capacitor/core";

interface ChiChatCallsPlugin {
  startForegroundCall(): Promise<void>;
  stopForegroundCall(): Promise<void>;
  requestIgnoreBatteryOptimizations(): Promise<{ ok: boolean }>;
  canUseFullScreenIntent(): Promise<{ granted: boolean }>;
  requestFullScreenIntentPermission(): Promise<{ ok: boolean }>;
  getCallReadiness(): Promise<CallReadiness>;
  openLockScreenSettings(): Promise<void>;
  openAutostartSettings(): Promise<void>;
  openNotificationSettings(): Promise<void>;
  openAppSettings(): Promise<void>;
}

/** What decides whether a call can ring while ChiChat is closed or the phone is locked. */
export type CallReadiness = {
  notifications?: boolean;
  callChannel?: boolean;
  fullScreen?: boolean;
  battery?: boolean;
  xiaomi?: boolean;
  /** Xiaomi "Show on lock screen" (missing when the phone won't say). */
  lockScreen?: boolean;
  /** Xiaomi "Display pop-up windows while running in the background". */
  backgroundPopups?: boolean;
  manufacturer?: string;
  model?: string;
  android?: string;
  sdk?: number;
  error?: string;
};

const ChiChatCalls = registerPlugin<ChiChatCallsPlugin>("ChiChatCalls");

export const isAndroidNative = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

export async function startCallForegroundService(): Promise<void> {
  if (!isAndroidNative()) return;
  try {
    await ChiChatCalls.startForegroundCall();
  } catch (e) {
    console.warn("[chichat-calls] startForegroundCall failed", e);
  }
}

export async function stopCallForegroundService(): Promise<void> {
  if (!isAndroidNative()) return;
  try {
    await ChiChatCalls.stopForegroundCall();
  } catch (e) {
    console.warn("[chichat-calls] stopForegroundCall failed", e);
  }
}

export async function requestIgnoreBatteryOptimizations(): Promise<void> {
  if (!isAndroidNative()) return;
  try {
    await ChiChatCalls.requestIgnoreBatteryOptimizations();
  } catch (e) {
    console.warn("[chichat-calls] requestIgnoreBatteryOptimizations failed", e);
  }
}

/**
 * Ensure the user has granted Full-Screen-Intent permission. Required on
 * Android 14+ for the screen to wake / lock-screen ringer to appear when an
 * incoming call notification arrives. We only prompt once per app launch.
 */
let fsiAsked = false;
export async function ensureFullScreenIntentPermission(): Promise<void> {
  if (!isAndroidNative() || fsiAsked) return;
  fsiAsked = true;
  try {
    const { granted } = await ChiChatCalls.canUseFullScreenIntent();
    if (!granted) {
      await ChiChatCalls.requestFullScreenIntentPermission();
    }
  } catch (e) {
    console.warn("[chichat-calls] full-screen-intent check failed", e);
  }
}

/** Null on web/iOS, or when this app build doesn't have the check yet. */
export async function getCallReadiness(): Promise<CallReadiness | null> {
  if (!isAndroidNative()) return null;
  try {
    return await ChiChatCalls.getCallReadiness();
  } catch {
    return null;
  }
}

type SettingsPage = "lockScreen" | "autostart" | "notifications" | "fullScreen" | "app";

/** Opens that system settings page. False if it couldn't (e.g. an old app build). */
export async function openCallSettings(page: SettingsPage): Promise<boolean> {
  if (!isAndroidNative()) return false;
  try {
    if (page === "lockScreen") await ChiChatCalls.openLockScreenSettings();
    else if (page === "autostart") await ChiChatCalls.openAutostartSettings();
    else if (page === "notifications") await ChiChatCalls.openNotificationSettings();
    else if (page === "fullScreen") await ChiChatCalls.requestFullScreenIntentPermission();
    else await ChiChatCalls.openAppSettings();
    return true;
  } catch (e) {
    console.warn("[chichat-calls] open settings failed", e);
    return false;
  }
}
