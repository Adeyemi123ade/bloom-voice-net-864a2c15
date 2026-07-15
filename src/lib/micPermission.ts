// Shared microphone-access diagnostics for anything that calls getUserMedia
// (voice notes in chat, the mic test page, calls). Centralized so every
// entry point gives the same, actionable guidance instead of each caller
// showing whatever raw DOMException message the browser happened to produce.

/**
 * True when the page is likely running inside a social/messaging app's
 * built-in browser (Instagram, Facebook, TikTok, WeChat, Line, Snapchat)
 * rather than the user's real browser. These in-app webviews frequently
 * identify themselves with "Chrome" or "Safari" in the user agent (so users
 * report the issue as "Chrome" or "Safari" not working) but silently block
 * getUserMedia with no permission UI at all — there is nothing the user can
 * grant from inside them; the only fix is opening the link in the real browser.
 */
export function isLikelyInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /FBAN|FBAV|Instagram|Line\/|MicroMessenger|TikTok|musical_ly|Snapchat/i.test(ua);
}

/**
 * Pre-flight check run *before* calling getUserMedia, so unsupported
 * environments get a clear message instead of a raw TypeError/ReferenceError
 * from calling into an API that doesn't exist here.
 */
export function checkMicPrerequisites(): string | null {
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    return "Voice messages require a secure (https://) connection. Please reload over https.";
  }
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return isLikelyInAppBrowser()
      ? "This link is open inside an app's built-in browser, which blocks microphone access. Tap the menu (••• or ⋮) and choose \"Open in Chrome\" or \"Open in Safari\", then try again."
      : "This browser doesn't support microphone recording. Try the latest Chrome, Safari, or Firefox.";
  }
  if (typeof MediaRecorder === "undefined") {
    return "This browser can't record audio. Try the latest Chrome, Safari, or Firefox.";
  }
  return null;
}

/** Turn a getUserMedia rejection into a title + actionable description. */
export function describeMicError(e: unknown): { title: string; description: string } {
  const name = e instanceof DOMException ? e.name : "";
  const message = e instanceof Error ? e.message : String(e ?? "");

  if (name === "NotAllowedError" || name === "SecurityError") {
    if (isLikelyInAppBrowser()) {
      return {
        title: "Microphone blocked by this app",
        description:
          "This link is open inside an app's built-in browser, which blocks microphone access and won't show a permission prompt. Tap the menu (••• or ⋮) and choose \"Open in Chrome\" or \"Open in Safari\", then try again.",
      };
    }
    return {
      title: "Microphone access denied",
      description:
        "Tap the lock/site-info icon next to the address bar → Permissions → Microphone → Allow, then reload the page. On Android, also check Settings → Apps → Chrome → Permissions → Microphone is on.",
    };
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return { title: "No microphone found", description: "No microphone was found on this device." };
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return {
      title: "Microphone busy",
      description: "Microphone is busy in another app. Close it and try again.",
    };
  }
  return { title: "Microphone blocked", description: message || "Could not access the microphone." };
}
