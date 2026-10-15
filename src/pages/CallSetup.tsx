import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, HelpCircle, Loader2, PhoneCall, X } from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBackNavigation } from "@/hooks/useBackNavigation";
import { type CallReadiness, getCallReadiness, isAndroidNative } from "@/lib/nativeCalls";
import { buildCallSetupItems } from "@/lib/callSetup";
import { getPushProblem, isCallPushReady, retryCallPush } from "@/lib/fcmRegistration";
import { type CallStage, lastCallTimeline } from "@/lib/callTimeline";

const STAGE_LABELS: [CallStage, string][] = [
  ["screen", "Call screen opened"],
  ["media", "Microphone ready"],
  ["saved", "Call saved"],
  ["push", "Other phone alerted"],
  ["room", "Call room ready"],
  ["token", "Permission to join"],
  ["joined", "Joined the call"],
  ["connected", "Connected"],
];

/** Timings of this phone's last call, to see where any slowness comes from. */
function LastCallSpeed() {
  const t = lastCallTimeline();
  const rows = STAGE_LABELS.filter(([k]) => t?.marks?.[k] !== undefined);
  return (
    <div className="mx-4 mb-6 rounded-xl bg-card border border-border p-4" data-testid="last-call-speed">
      <p className="text-sm font-semibold text-foreground">Last call speed</p>
      {!t || rows.length === 0 ? (
        <p className="text-xs text-muted-foreground mt-1">Make or answer a call, then come back here.</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground mt-1">
            {t.role === "callee" ? "A call you answered" : "A call you made"}
            {t.at ? `, ${new Date(t.at).toLocaleString()}` : ""}. Time after you tapped{" "}
            {t.role === "callee" ? "Accept" : "Call"}:
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {rows.map(([k, label]) => (
              <li key={k} className="flex justify-between text-xs">
                <span className="text-foreground">{label}</span>
                <span className="text-muted-foreground tabular-nums">
                  {((t.marks?.[k] ?? 0) / 1000).toFixed(1)} s
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default function CallSetup() {
  const { user } = useAuth();
  const { showBackArrow, goBack } = useBackNavigation("/settings");
  const native = isAndroidNative();
  const [readiness, setReadiness] = useState<CallReadiness | null>(null);
  const [checked, setChecked] = useState(false);
  const [pushReady, setPushReady] = useState(isCallPushReady());
  const [testState, setTestState] = useState<"idle" | "waiting" | "done">("idle");
  const [testResult, setTestResult] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setReadiness(await getCallReadiness());
    setPushReady(isCallPushReady());
    setChecked(true);
  }, []);

  useEffect(() => {
    document.title = "Call setup — Chichat";
    void refresh();
    // Coming back from a system settings page: check again.
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    const t = window.setInterval(() => setPushReady(isCallPushReady()), 1500);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(t);
    };
  }, [refresh]);

  const retryPush = () => {
    if (user) void retryCallPush(user.id).then(refresh);
  };

  const sendTest = async () => {
    setTestState("waiting");
    setTestResult(null);
    const { data, error } = await supabase.functions.invoke("send-call-push", {
      body: { action: "test", delaySeconds: 10 },
    });
    setTestState("done");
    const d = data as { sent?: number; reason?: string; error?: string } | null;
    if (error || !d) {
      // An old version of the function answers "missing fields" (400).
      const msg = error?.message ?? "";
      setTestResult(
        /400|non-2xx/i.test(msg)
          ? "The send-call-push function on Supabase is an older version. Redeploy it from the repo, then try again."
          : `The test couldn't be sent: ${msg || "unknown error"}.`,
      );
      return;
    }
    if (d.error && !d.sent) {
      setTestResult(
        /FCM_SERVICE_ACCOUNT_JSON/.test(d.error)
          ? "Firebase isn't set up on the server: add the FCM_SERVICE_ACCOUNT_JSON secret in Supabase."
          : `Firebase refused the test: ${d.error}`,
      );
      return;
    }
    if (!d.sent) {
      setTestResult(
        d.reason === "no tokens"
          ? "This phone isn't registered for calls yet (see \"Phone registered for calls\" above)."
          : "Nothing was sent.",
      );
      return;
    }
    setTestResult(
      `Sent to ${d.sent} phone${d.sent === 1 ? "" : "s"}. If yours didn't ring, fix anything above that isn't green and test again.`,
    );
  };

  const items = native ? buildCallSetupItems(readiness, pushReady, getPushProblem(), retryPush) : [];
  const allGood = items.length > 0 && items.every((i) => i.status === "ok");

  return (
    <MobileFrame>
      <div className="h-full w-full flex flex-col bg-background overflow-y-auto">
        <div className="px-3 pt-4 pb-3 flex items-center gap-2 border-b border-border sticky top-0 bg-background z-10">
          {showBackArrow && (
            <button
              aria-label="Back"
              onClick={goBack}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary"
            >
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
          )}
          <h1 className="text-lg font-bold text-foreground">Calls when ChiChat is closed</h1>
        </div>

        {!native ? (
          <div className="p-5 text-sm text-muted-foreground leading-relaxed">
            A website can't ring when it's closed or the phone is locked. Install the ChiChat
            Android app to get calls like a normal phone call.
          </div>
        ) : (
          <div className="px-4 py-4 flex flex-col gap-3">
            <p className="text-sm text-muted-foreground leading-relaxed">
              For calls to ring when ChiChat is closed or your phone is locked, everything below
              needs to be green. Tap a button, change the setting, then come back here.
            </p>
            {readiness === null && checked && (
              <p className="text-xs rounded-lg bg-secondary p-3 text-muted-foreground">
                This app build can't check the phone's settings. Rebuild the app from the latest
                code to get the full check.
              </p>
            )}
            <ul className="flex flex-col gap-2" data-testid="call-setup-items">
              {items.map((i) => (
                <li
                  key={i.key}
                  data-status={i.status}
                  className="flex items-start gap-3 rounded-xl bg-card border border-border p-3"
                >
                  <span
                    className={`mt-0.5 w-6 h-6 rounded-full shrink-0 flex items-center justify-center ${
                      i.status === "ok"
                        ? "bg-primary text-primary-foreground"
                        : i.status === "missing"
                          ? "bg-destructive text-destructive-foreground"
                          : "bg-muted text-muted-foreground"
                    }`}
                    aria-label={i.status === "ok" ? "Done" : i.status === "missing" ? "Needs fixing" : "Check yourself"}
                  >
                    {i.status === "ok" ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : i.status === "missing" ? (
                      <X className="w-3.5 h-3.5" />
                    ) : (
                      <HelpCircle className="w-3.5 h-3.5" />
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{i.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{i.detail}</p>
                  </div>
                  {i.action && i.status !== "ok" && (
                    <Button
                      size="sm"
                      variant={i.status === "missing" ? "default" : "outline"}
                      className="h-8 shrink-0"
                      onClick={i.action.run}
                    >
                      {i.action.label}
                    </Button>
                  )}
                </li>
              ))}
            </ul>

            <div className="rounded-xl bg-card border border-border p-4 mt-1">
              <p className="text-sm font-semibold text-foreground">Test it</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Tap the button, then lock your phone straight away. ChiChat will ring you in about
                10 seconds, the same way a real call does.
              </p>
              <Button
                className="w-full mt-3 h-10"
                onClick={sendTest}
                disabled={testState === "waiting"}
              >
                {testState === "waiting" ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Lock your phone now…
                  </>
                ) : (
                  <>
                    <PhoneCall className="w-4 h-4 mr-2" /> Send test call
                  </>
                )}
              </Button>
              {testResult && (
                <p className="text-xs text-foreground mt-3 leading-relaxed" data-testid="test-result">
                  {testResult}
                </p>
              )}
            </div>
            {allGood && (
              <p className="text-xs text-primary font-medium text-center">
                Everything this phone reports is set up.
              </p>
            )}
            {readiness?.model && (
              <p className="text-[11px] text-muted-foreground text-center">
                {readiness.manufacturer} {readiness.model} · Android {readiness.android}
              </p>
            )}
          </div>
        )}
        <LastCallSpeed />
      </div>
    </MobileFrame>
  );
}
