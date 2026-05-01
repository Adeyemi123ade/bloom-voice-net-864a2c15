// Tracks whether the signed-in user has cleared the device-verification gate.
// - Mobile: localStorage (survives app restarts; trusted-device pattern).
// - Web: sessionStorage (cleared when the tab/browser closes; web requires
//   OTP on EVERY new sign-in but not on page refresh during the same session).
import { getDeviceId } from "./deviceId";
import { getAppPlatform } from "./platform";

const PREFIX = "chichat.device_verified.";

function key(userId: string) {
  return `${PREFIX}${userId}.${getDeviceId()}`;
}

function store(): Storage | null {
  try {
    return getAppPlatform() === "mobile" ? localStorage : sessionStorage;
  } catch {
    return null;
  }
}

export function markDeviceVerified(userId: string) {
  try { store()?.setItem(key(userId), "1"); } catch { /* ignore */ }
}

export function isDeviceVerifiedLocally(userId: string): boolean {
  try { return store()?.getItem(key(userId)) === "1"; } catch { return false; }
}

export function clearDeviceVerified(userId: string) {
  try { store()?.removeItem(key(userId)); } catch { /* ignore */ }
}
