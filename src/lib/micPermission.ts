import { tNow } from "@/lib/i18n/language";
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
    return tNow("mic.https");
  }
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return isLikelyInAppBrowser()
      ? tNow("mic.inApp")
      : tNow("mic.unsupported");
  }
  if (typeof MediaRecorder === "undefined") {
    return tNow("mic.unsupported");
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
        title: tNow("mic.blockedApp"),
        description: tNow("mic.inApp"),
      };
    }
    return {
      title: tNow("mic.denied"),
      description: tNow("mic.deniedBody"),
    };
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return { title: tNow("mic.none"), description: tNow("mic.noneBody") };
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return {
      title: tNow("mic.busy"),
      description: tNow("mic.busyBody"),
    };
  }
  return { title: tNow("mic.blocked"), description: message || tNow("mic.blockedBody") };
}
