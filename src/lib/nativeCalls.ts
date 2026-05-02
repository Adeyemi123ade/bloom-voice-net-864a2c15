// Bridge to the native ChiChatCalls Capacitor plugin (Android only).
// Safely no-ops on web / iOS so the rest of the app doesn't need platform checks.
import { Capacitor, registerPlugin } from "@capacitor/core";

interface ChiChatCallsPlugin {
  startForegroundCall(): Promise<void>;
  stopForegroundCall(): Promise<void>;
  requestIgnoreBatteryOptimizations(): Promise<{ ok: boolean }>;
  canUseFullScreenIntent(): Promise<{ granted: boolean }>;
  requestFullScreenIntentPermission(): Promise<{ ok: boolean }>;
}

const ChiChatCalls = registerPlugin<ChiChatCallsPlugin>("ChiChatCalls");

const isAndroidNative = () =>
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
