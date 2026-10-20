import { ReactNode, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import BrandHero from "@/components/BrandHero";
import { authStyles } from "@/components/auth/authStyles";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { isAndroidBrowser, isLiveSite, OPEN_APP_URL } from "@/lib/platform";

// Public pages that must still open from a link in any browser.
const ALWAYS_OPEN = new Set(["/privacy", "/terms"]);

/**
 * One ChiChat account per Android phone: on Android, ChiChat runs only in the
 * app. ChiChat Web in a phone browser shows this screen instead of signing
 * in, and a browser that was already signed in is signed out (on this
 * browser only; the app and other devices stay signed in).
 * Computers and iPhones keep using ChiChat Web.
 */
export default function AndroidAppGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [blocked] = useState(() => isAndroidBrowser() && isLiveSite(window.location.hostname));

  useEffect(() => {
    if (!blocked) return;
    // A session left from before this rule: end it here only.
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void supabase.auth.signOut({ scope: "local" }).catch(() => {});
    });
  }, [blocked]);

  if (!blocked || ALWAYS_OPEN.has(pathname)) return <>{children}</>;
  return <UseTheApp />;
}

export function UseTheApp() {
  return (
    <div className="min-h-[100dvh] w-full bg-background flex justify-center">
      <div className="w-full max-w-md px-4 pt-6 pb-8 flex flex-col">
        <BrandHero message="On Android phones, ChiChat works in the ChiChat app." />
        <h1 className={`${authStyles.title} mt-6`}>Use the ChiChat app</h1>
        <p className={authStyles.subtitle}>
          To keep one account per phone, chats and calls on Android are only in the app.
          On a computer, you can keep using ChiChat in the browser.
        </p>
        <div className="mt-6">
          <Button asChild className={authStyles.primaryButton}>
            <a href={OPEN_APP_URL}>Open the ChiChat app</a>
          </Button>
          <p className={`${authStyles.footnote} mt-3`}>
            Don't have it yet? The button takes you to it on Google Play.
          </p>
        </div>
      </div>
    </div>
  );
}
