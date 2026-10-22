import { Capacitor, registerPlugin } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { supabase } from "@/integrations/supabase/client";
import { appGoogleStartUrl, markGoogleSignInStarted } from "@/lib/appGoogleHandoff";
import { reportProblem } from "@/lib/errorReport";

const WEB_CANONICAL_ORIGIN = "https://chichatapp.com";
const WEB_GOOGLE_RETURN_URL = `${WEB_CANONICAL_ORIGIN}/auth/google-return`;

// The Google sign-in client Supabase uses (Authentication > Providers >
// Google). Native sign-in asks Google for a token meant for this client, so
// Supabase accepts it. Public value, not a secret.
export const GOOGLE_WEB_CLIENT_ID = "293491364977-tjb6vl7f5nkej0ed8ogf6kj4eikc8c4d.apps.googleusercontent.com";

// The app's own return address. Older app versions sent people here
// directly; GoogleOAuthReturnListener still accepts it, and it is also how
// the browser tab hands the result back (see appGoogleHandoff.ts).
export const NATIVE_GOOGLE_RETURN_URL = "com.bloomvoicenet.chat://auth/google-return";

// Always show Google's account chooser, so people pick which Google account
// to use instead of silently getting the last one.
const CHOOSE_ACCOUNT = { prompt: "select_account" };

interface ChiChatGooglePlugin {
  signIn(options: { serverClientId: string; nonce: string }): Promise<{ idToken: string; email?: string; name?: string }>;
}
const ChiChatGoogle = registerPlugin<ChiChatGooglePlugin>("ChiChatGoogle");

export type GoogleAuthResult = {
  error: Error | null;
  /** Signed in already (native picker): go to /auth/google-return now. */
  signedIn?: boolean;
  /** The person closed Google's picker: nothing to show. */
  cancelled?: boolean;
};

/** A one-time random value tying Google's token to this sign-in (replay protection). */
export function makeNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function errorCode(e: unknown): string {
  return (e as { code?: string } | null)?.code ?? "";
}

function errorMessage(e: unknown): string {
  return String((e as { message?: string } | null)?.message ?? e ?? "");
}

/**
 * Why Google sign-in didn't finish, for the screen to explain.
 * - setup: Google refused this build of the app (Android OAuth client
 *   missing, or its package name / SHA-1 doesn't match the signing key).
 * - no_account: no Google account on the phone.
 * - rejected: Google gave a token but Supabase didn't accept it.
 * - failed: anything else.
 * `detail` is the short original message, shown under the plain text.
 */
export type GoogleFailKind = "setup" | "no_account" | "rejected" | "failed";
export class GoogleSignInError extends Error {
  constructor(public kind: GoogleFailKind, public detail: string) {
    super(detail || kind);
    this.name = "GoogleSignInError";
  }
}

/** Google's own wording for "this app isn't set up to ask for a token". */
export function looksLikeSetupProblem(message: string): boolean {
  return /\[16\]|reauth|\[10\]|28444|developer console|audience|unacceptable audience/i.test(message);
}

/**
 * Android app with the native picker (APK 1.10 and later): Android's own
 * Google account picker gives a Google ID token, and Supabase checks it
 * directly. No browser, no one-time code, no return link.
 *
 * Returns null only when the picker isn't in this APK (older versions), so
 * the caller can use the browser flow. A picker that is there but fails
 * returns the reason instead.
 */
async function nativeGoogleSignIn(): Promise<GoogleAuthResult | null> {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("ChiChatGoogle")) return null;
  const rawNonce = makeNonce();
  let idToken: string;
  const startedAt = Date.now();
  try {
    const res = await ChiChatGoogle.signIn({ serverClientId: GOOGLE_WEB_CLIENT_ID, nonce: await sha256Hex(rawNonce) });
    idToken = res.idToken;
  } catch (e) {
    const code = errorCode(e);
    const message = errorMessage(e);
    const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
    // Always recorded (admin page, kind google-native): a "cancel" can be
    // Google refusing the app, and that used to leave no trace at all.
    reportProblem("google-native", `${code || "error"} after ${secs}s: ${message}`);
    // Older APKs send every cancellation as plain "cancelled" with no
    // message; newer ones send "setup" when Google refused the app.
    if (code === "cancelled" && !looksLikeSetupProblem(message)) return { error: null, cancelled: true };
    if (code === "setup" || looksLikeSetupProblem(message)) return { error: new GoogleSignInError("setup", message) };
    if (code === "no_account") return { error: new GoogleSignInError("no_account", message) };
    // The browser way is what failed on Android before ("Unable to exchange
    // external code"), so don't send people round in a circle: say what
    // went wrong instead.
    return { error: new GoogleSignInError("failed", message) };
  }
  // Google puts the hashed nonce in the token; Supabase hashes the raw one
  // and checks they match.
  const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token: idToken, nonce: rawNonce });
  if (error) {
    reportProblem("google-native", `signInWithIdToken: ${error.message}`);
    const kind: GoogleFailKind = looksLikeSetupProblem(error.message) ? "setup" : "rejected";
    return { error: new GoogleSignInError(kind, error.message) };
  }
  return { error: null, signedIn: true };
}

/**
 * Starts "Continue with Google" (Supabase Auth's Google provider).
 *
 * Web: Supabase redirects the page through Google and back to
 * /auth/google-return on this origin.
 *
 * Android app: the native account picker (above). Older APKs without it
 * use the browser: Google runs in a browser tab that hands the result back
 * to the app (appGoogleHandoff.ts, GoogleOAuthReturnListener).
 *
 * Either way /auth/google-return then sends returning accounts to their
 * chats and new ones to the registration form with their Google name and
 * email filled in (GoogleReturn.tsx).
 */
export async function startGoogleAuth(): Promise<GoogleAuthResult> {
  if (Capacitor.isNativePlatform()) {
    const native = await nativeGoogleSignIn();
    if (native) return native;

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: WEB_GOOGLE_RETURN_URL, skipBrowserRedirect: true, queryParams: CHOOSE_ACCOUNT },
    });
    if (error) return { error };
    if (!data?.url) return { error: new Error("No Google sign-in URL returned") };
    markGoogleSignInStarted();
    await Browser.open({ url: appGoogleStartUrl(data.url) });
    return { error: null };
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: WEB_GOOGLE_RETURN_URL, queryParams: CHOOSE_ACCOUNT },
  });
  return { error };
}
