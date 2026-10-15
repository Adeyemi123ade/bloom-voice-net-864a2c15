import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BellRing, X } from "lucide-react";
import { getCallReadiness, isAndroidNative } from "@/lib/nativeCalls";
import { getPushProblem, isCallPushReady } from "@/lib/fcmRegistration";
import { buildCallSetupItems } from "@/lib/callSetup";

const DISMISS_KEY = "chichat:call-setup-banner-dismissed";

/**
 * Android app only: a reminder on the chat list while something is stopping
 * calls from ringing when ChiChat is closed. Opens the Call setup page.
 */
export default function CallSetupBanner() {
  const navigate = useNavigate();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isAndroidNative()) return;
    try {
      if (sessionStorage.getItem(DISMISS_KEY)) return;
    } catch { /* ignore */ }
    let cancelled = false;
    const check = async () => {
      const r = await getCallReadiness();
      if (cancelled) return;
      // Give push registration a moment on app start before judging it.
      const items = buildCallSetupItems(r, isCallPushReady(), getPushProblem(), () => {});
      setShow(items.some((i) => i.status === "missing"));
    };
    const t = window.setTimeout(check, 4000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!show) return null;
  return (
    <div className="mx-4 mb-2 flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2.5">
      <BellRing className="w-5 h-5 text-primary shrink-0" />
      <button
        className="flex-1 min-w-0 text-left"
        onClick={() => navigate("/settings/calls")}
      >
        <p className="text-sm font-semibold text-foreground">Calls may not ring when ChiChat is closed</p>
        <p className="text-xs text-muted-foreground">Tap to finish setting up your phone</p>
      </button>
      <button
        aria-label="Dismiss"
        onClick={() => {
          setShow(false);
          try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
        }}
        className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
