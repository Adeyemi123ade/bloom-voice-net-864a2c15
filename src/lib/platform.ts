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
 * ChiChat app). On Android, ChiChat runs only in the app: the app and a
 * browser on the same phone keep separate sign-ins, so allowing both let one
 * phone hold two accounts (or ring twice for one).
 *
 * This reads only what the browser already says about itself (no
 * fingerprinting). It's a rule, not a lock: a browser set to pretend to be a
 * computer ("Desktop site") isn't recognised.
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

/**
 * Only on the live site. PR preview links (*.vercel.app) stay open on phone
 * browsers so changes can still be tested on a phone before merging.
 */
export function isLiveSite(hostname: string): boolean {
  return hostname === "chichatapp.com" || hostname.endsWith(".chichatapp.com");
}
