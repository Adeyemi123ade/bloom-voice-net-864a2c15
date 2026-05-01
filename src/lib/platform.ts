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
