import { useState } from "react";
import { useLocation } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { authStyles } from "@/components/auth/authStyles";
import { isAndroidBrowser, OPEN_APP_URL } from "@/lib/platform";

// Once "Continue in browser" is tapped, don't ask again on this browser for a week.
const DISMISSED_KEY = "chichat:androidAppPrompt:dismissedAt";
const ASK_AGAIN_MS = 7 * 24 * 60 * 60 * 1000;
// Not over the legal pages or a call.
const QUIET = [/^\/privacy$/, /^\/terms$/, /^\/call\//, /^\/dial\//];

function dismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISSED_KEY) ?? 0);
    return Date.now() - at < ASK_AGAIN_MS;
  } catch {
    return false;
  }
}

/**
 * ChiChat Web in a browser on an Android phone: suggest the ChiChat app
 * (it opens the app if installed, otherwise its Play Store page). Only a
 * suggestion: "Continue in browser" keeps using ChiChat Web as before.
 * Computers, iPhones and the app itself never see it.
 */
export default function AndroidAppPrompt() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(() => isAndroidBrowser() && !dismissedRecently());

  const keepBrowser = () => {
    try { localStorage.setItem(DISMISSED_KEY, String(Date.now())); } catch { /* ignore */ }
    setOpen(false);
  };

  if (QUIET.some((r) => r.test(pathname))) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) keepBrowser(); }}>
      <DialogContent className="max-w-[340px] rounded-2xl">
        <DialogHeader>
          <DialogTitle>ChiChat works best in the app</DialogTitle>
          <DialogDescription>
            On Android, the ChiChat app rings for calls even when it's closed. Get it from
            Google Play, or open it if you already have it.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 mt-1">
          <Button asChild className={authStyles.primaryButton}>
            <a href={OPEN_APP_URL}>Open or install the app</a>
          </Button>
          <Button variant="outline" className={authStyles.secondaryButton} onClick={keepBrowser}>
            Continue in browser
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
