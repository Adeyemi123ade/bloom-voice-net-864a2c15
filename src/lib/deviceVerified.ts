// Tracks whether the signed-in user has cleared the device-verification gate
// for the *current* session/device. Set in localStorage so a hard refresh
// after a successful verification doesn't re-prompt.
import { getDeviceId } from "./deviceId";

const PREFIX = "chichat.device_verified.";

function key(userId: string) {
  return `${PREFIX}${userId}.${getDeviceId()}`;
}

export function markDeviceVerified(userId: string) {
  try { localStorage.setItem(key(userId), "1"); } catch { /* ignore */ }
}

export function isDeviceVerifiedLocally(userId: string): boolean {
  try { return localStorage.getItem(key(userId)) === "1"; } catch { return false; }
}

export function clearDeviceVerified(userId: string) {
  try { localStorage.removeItem(key(userId)); } catch { /* ignore */ }
}
