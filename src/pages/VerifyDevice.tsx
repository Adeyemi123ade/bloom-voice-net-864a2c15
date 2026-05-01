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

  const reason: DeviceReason = state.reason ?? "new_device";
  const isTakeover = reason === "device_takeover";
  const isWebTakingOverMobile = reason === "web_mobile_active";
  // For ALL reasons we now show a confirmation step BEFORE sending the OTP.
  // The user must explicitly confirm they want to continue on this device.
  const [confirmedTakeover, setConfirmedTakeover] = useState(false);
  const [sendingInitial, setSendingInitial] = useState(false);

  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(45);
  const autoSubmitted = useRef(false);

  useEffect(() => {
    if (!loading && !user) navigate("/", { replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  // Send the OTP only after the user confirms they want to continue.
  const confirmAndSendOtp = async () => {
    if (sendingInitial) return;
    setSendingInitial(true);
    const { error } = await supabase.functions.invoke("request-device-otp", {
      body: {
        device_id: getDeviceId(),
        device_label: getDeviceLabel(),
        platform: getAppPlatform(),
      },
    });
    setSendingInitial(false);
    if (error) {
      toast({
        title: "Couldn't send verification code",
        description: "Please check your connection and try again.",
        variant: "destructive",
      });
      return;
    }
    setConfirmedTakeover(true);
    setSecondsLeft(45);
  };

  const verify = async (codeValue: string) => {
    if (!user || verifying || codeValue.length !== OTP_LENGTH) return;
    setVerifying(true);
    const { data, error } = await supabase.functions.invoke("verify-device-otp", {
      body: {
        device_id: getDeviceId(),
        device_label: getDeviceLabel(),
        platform: getAppPlatform(),
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
    const okTitle = isTakeover
      ? "This phone is now yours"
      : isWebTakingOverMobile
        ? "Signed in. Your phone has been signed out."
        : "Device verified";
    toast({ title: okTitle });
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
      body: {
        device_id: getDeviceId(),
        device_label: getDeviceLabel(),
        platform: getAppPlatform(),
      },
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
    navigate("/", { replace: true });
  };

  if (!user) return null;

  const headline = isTakeover
    ? "Account already active on another device"
    : isWebTakingOverMobile
      ? "Account already active on another device"
      : "Sign in on this device?";
  const confirmBlurb = isTakeover
    ? `${state.otherDisplayName || "Another ChiChat account"} is currently signed in on this phone. If you continue, they'll be signed out and we'll send a 6-digit code to ${user.email} to confirm it's you.`
    : isWebTakingOverMobile
      ? `Your ChiChat account is currently active on ${state.otherDisplayName || "your phone"}. If you continue, your phone will be signed out and we'll send a 6-digit code to ${user.email} to confirm it's you.`
      : `Your account is already active on another device. If you continue, we'll send a 6-digit code to ${user.email} to confirm this sign-in.`;
  const confirmCta = isTakeover
    ? "Continue and sign the other account out"
    : isWebTakingOverMobile
      ? "Continue and sign my phone out"
      : "Continue and send code";
  const otpBlurb = isTakeover
    ? `Enter the 6-digit code we sent to ${user.email} to confirm.`
    : isWebTakingOverMobile
      ? `We've sent a 6-digit code to ${user.email}. Enter it to finish signing in here.`
      : `Enter the 6-digit code we sent to ${user.email} to confirm this sign-in.`;

  // Pre-OTP confirm screen — shown for ALL reasons. The OTP is NOT sent
  // until the user explicitly confirms here.
  if (!confirmedTakeover) {
    return (
      <MobileFrame>
        <div className="h-full w-full flex flex-col bg-background overflow-y-auto">
          <div className="flex-1 flex flex-col px-4 pt-6 pb-6 items-center">
            <BrandHero className="mt-1 mb-5" message="Account already active on another device" />
            <h1 className="text-xl font-bold text-foreground text-center">{headline}</h1>
            <p className="text-base text-muted-foreground text-center mt-3 leading-relaxed max-w-xs">
              {confirmBlurb}
            </p>
            <Button
              onClick={confirmAndSendOtp}
              disabled={sendingInitial}
              className="w-full max-w-xs h-11 mt-8 text-base bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg"
            >
              {sendingInitial ? "Sending code…" : confirmCta}
            </Button>
            <button
              type="button"
              onClick={cancelAndSignOut}
              className="text-sm text-muted-foreground hover:text-foreground mt-4"
            >
              Cancel
            </button>
          </div>
        </div>
      </MobileFrame>
    );
  }

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
