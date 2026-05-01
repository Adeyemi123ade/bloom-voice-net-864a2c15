// Per-install device identifier. Stored in localStorage so it:
//   - survives sign-out (we want the same install to be "trusted" again)
//   - resets on uninstall / data clear (a fresh install is a new device)
//   - works in the web preview AND inside the Capacitor WebView
const KEY = "chichat.device_id";

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // Private mode / storage disabled — fall back to in-memory id (per session).
    return "ephemeral-" + Math.random().toString(36).slice(2);
  }
}

export function getDeviceLabel(): string {
  if (typeof navigator === "undefined") return "Unknown device";
  const ua = navigator.userAgent || "";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  return "Web browser";
}
