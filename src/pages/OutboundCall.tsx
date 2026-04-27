import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Device, Call } from "@twilio/voice-sdk";
import { Mic, MicOff, PhoneOff, Phone, UserPlus } from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { formatDisplay, toE164 } from "@/lib/phone";
import SaveContactDialog from "@/components/SaveContactDialog";
import { loadManualContacts, loadCachedContacts } from "@/lib/deviceContacts";

type Status = "connecting" | "ringing" | "connected" | "ended" | "failed";

export default function OutboundCall() {
  const { number } = useParams<{ number: string }>();
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  const [status, setStatus] = useState<Status>("connecting");
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [askSave, setAskSave] = useState(false);

  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);
  const tickRef = useRef<number | null>(null);
  const dialedRef = useRef(false);
  const endedRef = useRef(false);

  const e164 = number ? toE164(decodeURIComponent(number)) ?? decodeURIComponent(number) : "";
  const display = e164 ? formatDisplay(e164) : "";

  const isKnown = (() => {
    if (!e164) return true;
    const all = [...(loadCachedContacts() ?? []), ...loadManualContacts()];
    return all.some((c) => c.phones.includes(e164));
  })();

  useEffect(() => {
    document.title = `Calling ${display} — Chichat`;
  }, [display]);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user || !e164) return;
    // Hard guard: only ever dial once per mount. Prevents auto-redial after
    // a drop / re-render / StrictMode double-invoke.
    if (dialedRef.current) return;
    dialedRef.current = true;
    let cancelled = false;

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("twilio-voice-token", {
          body: {},
        });
        if (cancelled) return;
        if (error || !data?.token) {
          throw new Error(error?.message ?? "Could not get voice token");
        }
        const device = new Device(data.token, {
          codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
          logLevel: 1,
        });
        deviceRef.current = device;

        device.on("error", (e) => {
          console.error("Device error", e);
          setErrorMsg(e?.message ?? "Device error");
          endLocally("failed");
        });

        await device.register();

        if (cancelled || endedRef.current) return;

        const call = await device.connect({ params: { To: e164 } });
        callRef.current = call;
        setStatus("ringing");

        call.on("accept", () => {
          setStatus("connected");
          tickRef.current = window.setInterval(
            () => setSeconds((s) => s + 1),
            1000,
          );
        });
        call.on("disconnect", () => endLocally("ended"));
        call.on("cancel", () => endLocally("ended"));
        call.on("reject", () => endLocally("ended"));
        call.on("error", (e) => {
          console.error("Call error", e);
          setErrorMsg(e?.message ?? "Call error");
          endLocally("failed");
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Could not start call";
        setErrorMsg(msg);
        endLocally("failed");
        toast({ title: "Call failed", description: msg, variant: "destructive" });
      }
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, e164]);

  const cleanup = () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    try {
      callRef.current?.removeAllListeners?.();
      callRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      deviceRef.current?.removeAllListeners?.();
      deviceRef.current?.disconnectAll?.();
      deviceRef.current?.unregister?.();
      deviceRef.current?.destroy();
    } catch {
      /* ignore */
    }
    callRef.current = null;
    deviceRef.current = null;
  };

  const endLocally = (s: Status) => {
    if (endedRef.current) return;
    endedRef.current = true;
    cleanup();
    setStatus(s);
    if (s === "failed" && seconds < 3 && errorMsg == null) {
      setErrorMsg("Call dropped — if you're on a Twilio trial, consider upgrading for longer calls.");
    }
    // Do NOT auto-prompt to save the number after a call ends.
    // The user can tap the "Save contact" button if they want to.
  };

  const hangUp = () => {
    endLocally("ended");
  };

  const toggleMute = () => {
    const c = callRef.current;
    if (!c) return;
    const next = !muted;
    c.mute(next);
    setMuted(next);
  };

  const dur = `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;

  const statusText =
    status === "connecting"
      ? "Connecting…"
      : status === "ringing"
        ? "Ringing…"
        : status === "connected"
          ? dur
          : status === "failed"
            ? errorMsg ?? "Call failed"
            : "Call ended";

  return (
    <MobileFrame>
      <div className="h-full w-full flex flex-col bg-gradient-to-b from-primary/15 via-background to-background text-foreground">
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4">
          <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center">
            <Phone className="w-10 h-10 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Calling</p>
            <p className="text-lg font-semibold mt-1">{display || "Unknown"}</p>
            <p className="text-xs text-muted-foreground mt-2">{statusText}</p>
          </div>
        </div>

        <div className="px-6 pb-8 flex items-center justify-center gap-6">
          <button
            onClick={toggleMute}
            disabled={status !== "connected"}
            aria-label={muted ? "Unmute" : "Mute"}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 ${
              muted ? "bg-foreground text-background" : "bg-secondary text-foreground"
            }`}
          >
            {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {status === "ended" || status === "failed" ? (
            <button
              onClick={() => navigate(-1)}
              className="w-16 h-16 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground flex items-center justify-center"
              aria-label="Done"
            >
              <Phone className="w-6 h-6" />
            </button>
          ) : (
            <button
              onClick={hangUp}
              aria-label="End call"
              className="w-16 h-16 rounded-full bg-destructive hover:bg-destructive/90 text-destructive-foreground flex items-center justify-center"
            >
              <PhoneOff className="w-6 h-6" />
            </button>
          )}

          <button
            onClick={() => setAskSave(true)}
            disabled={!e164 || isKnown}
            aria-label="Save contact"
            className="w-14 h-14 rounded-full bg-secondary text-foreground flex items-center justify-center disabled:opacity-30"
          >
            <UserPlus className="w-5 h-5" />
          </button>
        </div>
      </div>

      {e164 && (
        <SaveContactDialog
          open={askSave}
          onOpenChange={setAskSave}
          phoneE164={e164}
        />
      )}
    </MobileFrame>
  );
}
