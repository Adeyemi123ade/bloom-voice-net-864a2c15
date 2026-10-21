import { callRpc } from "@/lib/rpc";
import { APP_BUILD, appPlatform } from "@/lib/appBuild";
import { initialLanguage } from "@/lib/i18n/language";

/**
 * Saves app problems (crashes and errors) quietly so they show on the admin
 * page. Never shows anything to the person using the app, never throws,
 * and sends at most a few per session.
 */

const MAX_PER_SESSION = 20;
let sent = 0;
const seen = new Set<string>();

// Noise from browsers and extensions that says nothing about ChiChat.
const IGNORE = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /Non-Error promise rejection captured/i,
  /AbortError/i,
  /The user aborted a request/i,
  /Load failed$/i,
  /chrome-extension:|moz-extension:/i,
];

/** After a new version goes live, pieces of the old one are gone: reload once. */
export function isStaleBuildError(message: string): boolean {
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk \d+ failed/i.test(
    message,
  );
}

function errorParts(reason: unknown): { message: string; stack?: string } {
  if (reason instanceof Error) return { message: `${reason.name}: ${reason.message}`, stack: reason.stack };
  if (typeof reason === "string") return { message: reason };
  try {
    return { message: JSON.stringify(reason).slice(0, 1000) };
  } catch {
    return { message: String(reason) };
  }
}

export function reportProblem(kind: string, reason: unknown, extraStack?: string): void {
  try {
    const { message, stack } = errorParts(reason);
    if (!message || IGNORE.some((r) => r.test(message))) return;
    const key = `${kind}|${message}`;
    if (seen.has(key) || sent >= MAX_PER_SESSION) return;
    seen.add(key);
    sent++;
    void callRpc("log_app_error", {
        _kind: kind,
        _message: message,
        _stack: [stack, extraStack].filter(Boolean).join("\n---\n") || null,
        _url: location.pathname,
        _app_build: APP_BUILD,
        _platform: appPlatform(),
        _user_agent: navigator.userAgent,
        _language: initialLanguage(),
      });
  } catch {
    /* reporting must never break the app */
  }
}

let installed = false;

/** Listens for errors anywhere in the app. Call once at start-up. */
export function installErrorReporting(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => {
    const msg = e.error instanceof Error ? e.error.message : e.message;
    if (msg && isStaleBuildError(msg)) return handleStaleBuild();
    reportProblem("error", e.error ?? e.message);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const { message } = errorParts(e.reason);
    if (isStaleBuildError(message)) return handleStaleBuild();
    reportProblem("rejection", e.reason);
  });
  // Vite's own signal that a lazily loaded piece of the app is missing.
  window.addEventListener("vite:preloadError", (e) => {
    e.preventDefault();
    handleStaleBuild();
  });
}

let staleBuildHandler: (() => void) | null = null;

/** appUpdate registers how to check for a new version (avoids an import loop). */
export function setStaleBuildHandler(fn: () => void): void {
  staleBuildHandler = fn;
}

/**
 * A piece of the app failed to load. That means either a new version is live
 * (old files are gone) or the network is down. Reloading with no network
 * replaced ChiChat with the phone's "Web page not available" screen, even in
 * the middle of starting a call. So: offline, never reload; online, reload
 * only when a newer version really is live and nothing is in progress.
 */
export function handleStaleBuild(): void {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  if (staleBuildHandler) staleBuildHandler();
  else reloadForNewVersion();
}

const RELOAD_KEY = "chichat:staleReloadAt";

/** Reloads to pick up the new version, at most once a minute (no loops). */
export function reloadForNewVersion(): void {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    /* storage unavailable: still reload */
  }
  location.reload();
}
