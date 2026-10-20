/** Screens that may ask to come back after signing in (no open redirects). */
const ALLOWED = new Set(["/delete-account"]);
const KEY = "chichat:afterSignIn";

export function returnAfterSignIn(path: string): void {
  if (!ALLOWED.has(path)) return;
  try {
    sessionStorage.setItem(KEY, path);
  } catch {
    /* storage unavailable */
  }
}

/** Where to go after signing in: the remembered screen, else the chats. */
export function takeAfterSignIn(fallback = "/home"): string {
  try {
    const path = sessionStorage.getItem(KEY);
    if (path && ALLOWED.has(path)) return path;
  } catch {
    /* storage unavailable */
  }
  return fallback;
}

/** The remembered screen was reached; later sign-ins go to the chats again. */
export function clearAfterSignIn(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}
