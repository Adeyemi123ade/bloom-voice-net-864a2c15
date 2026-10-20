// Web vs mobile detection. Anything inside the Capacitor native shell is
// "mobile"; everything else (desktop browser, mobile browser, PWA) is "web".
import { Capacitor } from "@capacitor/core";

export type AppPlatform = "mobile" | "web";

export function getAppPlatform(): AppPlatform {
  try {
    return Capacitor.isNativePlatform() ? "mobile" : "web";
  } catch {
    return "web";
  }
}

export const isMobileApp = () => getAppPlatform() === "mobile";
export const isWebApp = () => getAppPlatform() === "web";

/**
 * ChiChat Web opened in a browser on an Android phone or tablet (not the
 * ChiChat app). Reads only what the browser already says about itself (no
 * fingerprinting); a browser set to "Desktop site" isn't recognised.
 */
export function isAndroidBrowser(): boolean {
  if (getAppPlatform() === "mobile") return false;
  try {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    if (nav.userAgentData?.platform === "Android") return true;
    return /Android/i.test(nav.userAgent ?? "");
  } catch {
    return false;
  }
}

/**
 * Opens the ChiChat app from Chrome on Android. If it isn't installed,
 * Android opens its Play Store page instead.
 */
export const ANDROID_PACKAGE = "com.bloomvoicenet.chat";
export const OPEN_APP_URL = `intent://open#Intent;scheme=${ANDROID_PACKAGE};package=${ANDROID_PACKAGE};end`;
