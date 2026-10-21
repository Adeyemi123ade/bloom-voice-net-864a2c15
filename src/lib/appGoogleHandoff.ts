/**
 * "Sign in with Google" from the Android app, the browser half.
 *
 * The app opens Google in the phone's browser (a Custom Tab). The old return
 * address, com.bloomvoicenet.chat://auth/google-return, only works when it is
 * on Supabase's list of allowed return addresses; when it isn't, Supabase
 * quietly sends the person to the website instead, the browser tab signs in,
 * and the app is left on the sign-in screen.
 *
 * Now the browser tab returns to the same address the website uses (already
 * allowed, since Google sign-in works on the web), and this file hands the
 * result back to the app:
 *
 * 1. The app opens https://www.chichatapp.com/auth/app-google?u=<Google URL>.
 *    That page marks this browser tab as "signing in for the app" and moves
 *    straight on to Google (runAppGoogleStart).
 * 2. Google -> Supabase -> chichatapp.com in the same tab. Before the
 *    Supabase client can read the address (and sign the BROWSER in), the
 *    result is taken off the address (captureAppGoogleReturn).
 * 3. The page opens the app with the result (appReturnLink). The app's
 *    GoogleOAuthReturnListener finishes signing in, as before.
 *
 * A web visitor never has the mark, so the website is unchanged.
 */

export const APP_GOOGLE_START_PATH = "/auth/app-google";
const SITE = "https://www.chichatapp.com";
const AUTHORIZE_PREFIX = "https://pnpabtxvsrkrldpfmtaz.supabase.co/auth/v1/authorize?";
const MARK_KEY = "chichat:appGoogleAt";
const MARK_MAX_AGE_MS = 15 * 60 * 1000;
const RESULT_KEYS = ["access_token", "refresh_token", "expires_in", "token_type", "code", "error", "error_code", "error_description"];

/** Where the app sends the browser tab to start signing in with Google. */
export function appGoogleStartUrl(googleUrl: string): string {
  return `${SITE}${APP_GOOGLE_START_PATH}?u=${encodeURIComponent(googleUrl)}`;
}

/** Only Supabase's own Google sign-in address may be passed through (no open redirect). */
export function isAllowedGoogleUrl(url: string | null | undefined): url is string {
  return !!url && url.startsWith(AUTHORIZE_PREFIX);
}

/** Step 1, in the browser tab: remember this tab signs in for the app, then go to Google. */
export function runAppGoogleStart(loc: Location = window.location, store: Storage = sessionStorage): boolean {
  try {
    if (loc.pathname !== APP_GOOGLE_START_PATH) return false;
    const target = new URLSearchParams(loc.search).get("u");
    if (!isAllowedGoogleUrl(target)) return false;
    store.setItem(MARK_KEY, String(Date.now()));
    loc.replace(target);
    return true;
  } catch {
    return false;
  }
}

/** The page is only passing through to Google; show nothing. */
export function isAppGoogleStart(loc: Location = window.location): boolean {
  return loc.pathname === APP_GOOGLE_START_PATH;
}

/** Picks the sign-in result out of an address (after # or ?). Empty when there is none. */
export function pickGoogleResult(hash: string, search: string): string {
  const out = new URLSearchParams();
  for (const part of [search.replace(/^\?/, ""), hash.replace(/^#/, "")]) {
    const params = new URLSearchParams(part);
    for (const key of RESULT_KEYS) {
      const value = params.get(key);
      if (value && !out.has(key)) out.set(key, value);
    }
  }
  const hasResult = out.has("access_token") || out.has("code") || out.has("error") || out.has("error_description");
  return hasResult ? out.toString() : "";
}

let pending: string | null = null;

/**
 * Step 2, in the browser tab, before the Supabase client starts: if this tab
 * is signing in for the app and the address carries the result, keep it for
 * the app and clear it from the address so the browser does not sign in.
 */
export function captureAppGoogleReturn(loc: Location = window.location, store: Storage = sessionStorage): void {
  try {
    const at = Number(store.getItem(MARK_KEY) ?? 0);
    if (!at || Date.now() - at > MARK_MAX_AGE_MS) return;
    const result = pickGoogleResult(loc.hash, loc.search);
    if (!result) return;
    store.removeItem(MARK_KEY);
    pending = result;
    window.history.replaceState(null, "", loc.pathname);
  } catch {
    /* storage or history unavailable: leave the address alone */
  }
}

/** The sign-in result waiting to go back to the app, if any. */
export function pendingAppGoogleReturn(): string | null {
  return pending;
}

/** Opens the ChiChat app (only ChiChat) with the sign-in result. */
export function appReturnLink(result: string): string {
  return `intent://auth/google-return?${result}#Intent;scheme=com.bloomvoicenet.chat;package=com.bloomvoicenet.chat;end`;
}

// In the app: Google is open in the browser. The automatic update must not
// reload the app now, or the result coming back would be lost.
const IN_PROGRESS_KEY = "chichat:googleSignInAt";
const IN_PROGRESS_MAX_MS = 10 * 60 * 1000;

export function markGoogleSignInStarted(store: Storage = sessionStorage): void {
  try { store.setItem(IN_PROGRESS_KEY, String(Date.now())); } catch { /* ignore */ }
}

export function markGoogleSignInFinished(store: Storage = sessionStorage): void {
  try { store.removeItem(IN_PROGRESS_KEY); } catch { /* ignore */ }
}

export function googleSignInInProgress(store: Storage = sessionStorage): boolean {
  try {
    const at = Number(store.getItem(IN_PROGRESS_KEY) ?? 0);
    return !!at && Date.now() - at < IN_PROGRESS_MAX_MS;
  } catch {
    return false;
  }
}

/** For tests. */
export function resetAppGoogleHandoff(): void {
  pending = null;
}
