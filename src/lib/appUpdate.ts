import { App as CapacitorApp } from "@capacitor/app";
import { APP_BUILD } from "@/lib/appBuild";
import { getCallsSnapshot } from "@/lib/activeCall";
import { reloadForNewVersion } from "@/lib/errorReport";

/**
 * Picks up a new version of ChiChat by itself. When the app comes back to
 * the screen (and every 15 minutes while open), it asks the site which
 * version is live; if it's newer, the app reloads, but only at a moment
 * that can't hurt: no call, nothing half typed, no window open.
 */

const CHECK_GAP_MS = 60_000;
const PERIODIC_MS = 15 * 60_000;
const RETRY_MS = 20_000;

let lastCheck = 0;
let pending = false;

export async function fetchLiveBuild(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { build?: unknown };
    return typeof data.build === "string" && data.build ? data.build : null;
  } catch {
    return null;
  }
}

/** A newer version is live (never true for local development builds). */
export function isNewerBuild(live: string | null, running = APP_BUILD): boolean {
  return !!live && running !== "dev" && running !== "test" && live !== running;
}

/** Reloading now loses nothing the person is in the middle of. */
export function isSafeToReload(doc: Document = document): boolean {
  const { calls, waiting } = getCallsSnapshot();
  if (calls.length > 0 || waiting) return false;
  if (location.pathname.startsWith("/call/") || location.pathname.startsWith("/dial/")) return false;
  const el = doc.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
  if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT") && el.value) return false;
  // Unsent text in the chat box, even when it isn't focused.
  for (const box of Array.from(doc.querySelectorAll("textarea"))) {
    if ((box as HTMLTextAreaElement).value.trim()) return false;
  }
  if (doc.querySelector('[role="dialog"], [role="alertdialog"], [data-recording="true"]')) return false;
  return true;
}

async function check(force = false): Promise<void> {
  if (document.visibilityState !== "visible") return;
  if (!pending) {
    if (!force && Date.now() - lastCheck < CHECK_GAP_MS) return;
    lastCheck = Date.now();
    pending = isNewerBuild(await fetchLiveBuild());
  }
  if (pending && isSafeToReload()) reloadForNewVersion();
}

let started = false;

/** Start watching for new versions. Call once at start-up. */
export function startAppUpdates(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  document.addEventListener("visibilitychange", () => void check());
  window.addEventListener("focus", () => void check());
  window.addEventListener("online", () => void check(true));
  try {
    void CapacitorApp.addListener("resume", () => void check(true));
  } catch {
    /* not in the app */
  }
  window.setInterval(() => void check(true), PERIODIC_MS);
  // Once a newer version is known, try again soon after the person finishes.
  window.setInterval(() => {
    if (pending) void check();
  }, RETRY_MS);
  // First look a little after start (the page itself was just loaded fresh).
  window.setTimeout(() => void check(true), 30_000);
}
