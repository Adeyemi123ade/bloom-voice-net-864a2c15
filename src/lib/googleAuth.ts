import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { supabase } from "@/integrations/supabase/client";

const WEB_CANONICAL_ORIGIN = "https://chichatapp.com";

// Must also be added as an allowed Redirect URL in the Supabase Dashboard
// (Authentication -> URL Configuration) — that's a one-time project setting
// this code cannot set for you.
export const NATIVE_GOOGLE_RETURN_URL = "com.bloomvoicenet.chat://auth/google-return";

/**
 * Starts "Sign in with Google" (Supabase Auth's Google provider).
 *
 * Web: unchanged — Supabase redirects the page directly through Google and
 * back to /auth/google-return on this origin.
 *
 * Native (Capacitor/Android): the app's own WebView has no way to hand a
 * `https://chichatapp.com/...` return back to the native shell (no intent
 * filter matches it, no appUrlOpen fires), so instead of letting
 * signInWithOAuth navigate the WebView, this opens the OAuth URL in an
 * external browser tab and uses the `com.bloomvoicenet.chat://` custom
 * scheme already declared in AndroidManifest.xml as the return target.
 * GoogleOAuthReturnListener (mounted once in App.tsx) catches that return
 * via Capacitor's `appUrlOpen` event and establishes the session.
 */
export async function startGoogleAuth(): Promise<{ error: Error | null }> {
  if (Capacitor.isNativePlatform()) {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: NATIVE_GOOGLE_RETURN_URL, skipBrowserRedirect: true },
    });
    if (error) return { error };
    if (!data?.url) return { error: new Error("No Google sign-in URL returned") };
    await Browser.open({ url: data.url });
    return { error: null };
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${WEB_CANONICAL_ORIGIN}/auth/google-return` },
  });
  return { error };
}
