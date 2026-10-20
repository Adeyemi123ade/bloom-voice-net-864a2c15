import { Capacitor } from "@capacitor/core";

/** Which build of the website is running (commit on Vercel). */
export const APP_BUILD: string = typeof __APP_BUILD__ === "string" ? __APP_BUILD__ : "dev";

/** "android", "ios" or "web" (web also covers a phone browser). */
export function appPlatform(): string {
  try {
    return Capacitor.getPlatform();
  } catch {
    return "web";
  }
}

/** A short description of the phone or computer, for feedback and problem reports. */
export function deviceSummary(): string {
  const ua = navigator.userAgent || "";
  const android = ua.match(/Android [\d.]+(?:; ([^;)]+))?/);
  if (android) return `Android ${android[0].split(" ")[1].replace(";", "")}${android[1] ? ` · ${android[1].trim()}` : ""}`;
  if (/iPhone|iPad/.test(ua)) return /iPad/.test(ua) ? "iPad" : "iPhone";
  if (/Windows/.test(ua)) return "Windows";
  if (/Mac OS X/.test(ua)) return "Mac";
  if (/Linux/.test(ua)) return "Linux";
  return "Unknown";
}
