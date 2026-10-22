import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { supabase } from "@/integrations/supabase/client";
import { appGoogleStartUrl, markGoogleSignInStarted } from "@/lib/appGoogleHandoff";

const WEB_CANONICAL_ORIGIN = "https://chichatapp.com";
const WEB_GOOGLE_RETURN_URL = `${WEB_CANONICAL_ORIGIN}/auth/google-return`;

// The app's own return address. Older app versions sent people here
// directly; GoogleOAuthReturnListener still accepts it, and it is also how
// the browser tab hands the result back (see appGoogleHandoff.ts).
export const NATIVE_GOOGLE_RETURN_URL = "com.bloomvoicenet.chat://auth/google-return";

// Always show Google's account chooser, so people pick which Google account
// to use instead of silently getting the last one.
const CHOOSE_ACCOUNT = { prompt: "select_account" };

/**
 * Starts "Sign in with Google" (Supabase Auth's Google provider).
 *
 * Web: Supabase redirects the page through Google and back to
 * /auth/google-return on this origin.
 *
 * Android app: Google runs in the phone's browser. It returns to the same
 * address as the website, and that page hands the result back to the app
 * (appGoogleHandoff.ts), where GoogleOAuthReturnListener signs in. The
 * account check then sends returning people to their chats and new people
 * to the registration form with their Google name and email filled in
 * (GoogleReturn.tsx).
 */
export async function startGoogleAuth(): Promise<{ error: Error | null }> {
  if (Capacitor.isNativePlatform()) {
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
