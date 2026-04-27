// Bridge to the native ChiChatCalls Capacitor plugin (Android only).
// Safely no-ops on web / iOS so the rest of the app doesn't need platform checks.
import { Capacitor, registerPlugin } from "@capacitor/core";

interface ChiChatCallsPlugin {
  startForegroundCall(): Promise<void>;
  stopForegroundCall(): Promise<void>;
  requestIgnoreBatteryOptimizations(): Promise<{ ok: boolean }>;
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
