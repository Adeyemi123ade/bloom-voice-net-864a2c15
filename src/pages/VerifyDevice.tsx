import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getDeviceId, getDeviceLabel } from "@/lib/deviceId";
import { getAppPlatform } from "@/lib/platform";
import { markDeviceVerified } from "@/lib/deviceVerified";
import MobileFrame from "@/components/MobileFrame";
import BrandHero from "@/components/BrandHero";
import { Button } from "@/components/ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { toast } from "@/hooks/use-toast";

const OTP_LENGTH = 6;

type DeviceReason = "new_device" | "device_takeover" | "web_mobile_active";

export default function VerifyDevice() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useAuth();
  const state = (location.state as {
    reason?: DeviceReason;
    otherDisplayName?: string | null;
  } | null) ?? {};

  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(45);
  const autoSubmitted = useRef(false);

  useEffect(() => {
    if (!loading && !user) navigate("/login", { replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  const verify = async (codeValue: string) => {
    if (!user || verifying || codeValue.length !== OTP_LENGTH) return;
    setVerifying(true);
    const { data, error } = await supabase.functions.invoke("verify-device-otp", {
      body: {
        device_id: getDeviceId(),
        device_label: getDeviceLabel(),
        code: codeValue,
      },
    });
    setVerifying(false);
    if (error || !data?.ok) {
      setCode("");
      autoSubmitted.current = false;
      toast({
        title: "Wrong or expired code",
        description: "Double-check the code in your email and try again.",
        variant: "destructive",
      });
      return;
    }
    markDeviceVerified(user.id);
    toast({ title: state.reason === "device_takeover" ? "This phone is now yours" : "Device verified" });
    navigate("/home", { replace: true });
  };

  const handleChange = (value: string) => {
    setCode(value);
    if (value.length === OTP_LENGTH && !autoSubmitted.current) {
      autoSubmitted.current = true;
      verify(value);
    }
  };

  const resend = async () => {
    if (secondsLeft > 0) return;
    setResending(true);
    const { error } = await supabase.functions.invoke("request-device-otp", {
      body: { device_id: getDeviceId(), device_label: getDeviceLabel() },
    });
    setResending(false);
    if (error) {
      toast({ title: "Couldn't send a new code", variant: "destructive" });
      return;
    }
    toast({ title: "New code sent" });
    setSecondsLeft(45);
  };

  const cancelAndSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  if (!user) return null;

  const isTakeover = state.reason === "device_takeover";
  const headline = isTakeover ? "This phone is in use" : "Verify this device";
  const blurb = isTakeover
    ? `${state.otherDisplayName || "Another ChiChat account"} is currently signed in on this phone. Continuing will sign them out. Enter the 6-digit code we sent to your email to confirm.`
    : `For your security, enter the 6-digit code we sent to ${user.email} to confirm this is you on a new device.`;

  return (
    <MobileFrame>
      <div className="h-full w-full flex flex-col bg-background overflow-y-auto">
        <div className="flex-1 flex flex-col px-4 pt-6 pb-6 items-center">
          <BrandHero className="mt-1 mb-5" message={blurb} />
          <h1 className="text-xl font-bold text-foreground text-center">{headline}</h1>
          <p className="text-base text-muted-foreground text-center mt-2 leading-relaxed max-w-xs">
            Code sent to <span className="text-foreground font-semibold">{user.email}</span>. It expires in 10 minutes.
          </p>

          <div className="mt-7 w-full flex justify-center">
            <InputOTP
              maxLength={OTP_LENGTH}
              value={code}
              onChange={handleChange}
              autoFocus
              inputMode="numeric"
              pattern="^[0-9]+$"
              disabled={verifying}
              containerClassName="gap-1.5"
            >
              <InputOTPGroup className="gap-1.5">
                {Array.from({ length: OTP_LENGTH }, (_, i) => (
                  <InputOTPSlot
                    key={i}
                    index={i}
                    className="h-12 w-9 text-base font-bold border-r border-border first:border-l rounded-md bg-input"
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>

          <p className="text-sm text-muted-foreground mt-4 text-center">
            {verifying ? "Verifying…" : "We'll verify it automatically when you finish typing."}
          </p>

          <div className="mt-8 text-center">
            {secondsLeft > 0 ? (
              <p className="text-sm text-muted-foreground">
                Didn't get it? Resend in <span className="font-semibold text-foreground">{secondsLeft}s</span>
              </p>
            ) : (
              <button
                type="button"
                onClick={resend}
                disabled={resending}
                className="text-sm font-semibold text-accent hover:underline disabled:opacity-50"
              >
                {resending ? "Sending…" : "Resend code"}
              </button>
            )}
          </div>

          <Button
            onClick={() => verify(code)}
            disabled={verifying || code.length !== OTP_LENGTH}
            className="w-full max-w-xs h-11 mt-8 text-base bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg"
          >
            {verifying ? "Verifying…" : "Verify"}
          </Button>

          <button
            type="button"
            onClick={cancelAndSignOut}
            className="text-sm text-muted-foreground hover:text-foreground mt-4"
          >
            Cancel and sign out
          </button>
        </div>
      </div>
    </MobileFrame>
  );
}
