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

/**
 * Android app with the native picker (APK 1.10 and later): Android's own
 * Google account picker gives a Google ID token, and Supabase checks it
 * directly. No browser, no one-time code, no return link.
 *
 * Returns null when the picker isn't available or failed for a reason
 * other than the person closing it, so the caller can use the browser flow.
 */
async function nativeGoogleSignIn(): Promise<GoogleAuthResult | null> {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("ChiChatGoogle")) return null;
  const rawNonce = makeNonce();
  let idToken: string;
  try {
    const res = await ChiChatGoogle.signIn({ serverClientId: GOOGLE_WEB_CLIENT_ID, nonce: await sha256Hex(rawNonce) });
    idToken = res.idToken;
  } catch (e) {
    if (errorCode(e) === "cancelled") return { error: null, cancelled: true };
    reportProblem("google-native", e);
    return null;
  }
  // Google puts the hashed nonce in the token; Supabase hashes the raw one
  // and checks they match.
  const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token: idToken, nonce: rawNonce });
  if (error) {
    reportProblem("google-native", `signInWithIdToken: ${error.message}`);
    return { error };
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
