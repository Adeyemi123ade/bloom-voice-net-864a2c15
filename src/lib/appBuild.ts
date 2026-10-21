import { Capacitor } from "@capacitor/core";

/** Which build of the website is running (commit on Vercel). An internal
 *  code for update checks and problem reports, not a version number. */
export const APP_BUILD: string = typeof __APP_BUILD__ === "string" ? __APP_BUILD__ : "dev";

/** The version people see, from package.json: "1.9.0" shows as "1.9". */
export function displayVersion(raw: string): string {
  return raw.replace(/\.0$/, "");
}
export const APP_VERSION: string = displayVersion(typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "");

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
