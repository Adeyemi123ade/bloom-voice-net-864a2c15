import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AuthScreen from "@/components/auth/AuthScreen";
import { authStyles } from "@/components/auth/authStyles";
import { useLanguage } from "@/lib/i18n/context";
import BrandHero from "@/components/BrandHero";
import { Button } from "@/components/ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getVerifyEmailPending, clearVerifyEmailPending } from "@/lib/verifyEmailPending";

const OTP_LENGTH = 6;

/**
 * Verify email with a 6-digit OTP after signup.
 * The email is passed via `location.state.email`. If missing, we route the
 * user back to /register so they can start over (we never expose technical
 * details, per project rule).
 */
export default function VerifyEmail() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const stateEmail = (location.state as { email?: string } | null)?.email ?? "";

  // Router state is lost on refresh/back-navigation — fall back to the
  // persisted pending email so this screen survives both.
  const [email] = useState(() => stateEmail || getVerifyEmailPending() || "");
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(45);
  const autoSubmitted = useRef(false);

  useEffect(() => {
    document.title = `${t("ve.pageTitle")} — ChiChat`;
  }, []);

  useEffect(() => {
    if (!email) {
      navigate("/register", { replace: true });
    }
  }, [email, navigate]);

  // Countdown for "Resend code"
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  const verify = async (codeValue: string) => {
    if (!email || codeValue.length !== OTP_LENGTH || verifying) return;
    setVerifying(true);
    const { data, error } = await supabase.functions.invoke("verify-otp-code", {
      body: { email, code: codeValue, type: "signup" },
    });
    setVerifying(false);
    if (error) {
      setCode("");
      autoSubmitted.current = false;
      toast({
        title: t("code.wrong"),
        description: t("code.wrongBody"),
        variant: "destructive",
      });
      return;
    }
    if (data?.session?.access_token && data?.session?.refresh_token) {
      await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
    }
    clearVerifyEmailPending();
    toast({ title: t("ve.verified") });
    navigate("/welcome", { replace: true });
  };

  // Auto-submit as soon as the user types/pastes 6 digits.
  const handleChange = (value: string) => {
    setCode(value);
    if (value.length === OTP_LENGTH && !autoSubmitted.current) {
      autoSubmitted.current = true;
      verify(value);
    }
  };

  const resend = async () => {
    if (!email || secondsLeft > 0) return;
    setResending(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
    });
    setResending(false);
    if (error) {
      toast({
        title: t("code.cantResend"),
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: t("code.newSent") });
    setSecondsLeft(45);
  };

  if (!email) return null;

  return (
    <AuthScreen onBack={() => { clearVerifyEmailPending(); navigate("/register"); }}>
      <div className="mt-1 flex flex-col items-center">
        <BrandHero
          className="mb-5"
          message={t("ve.msg", { email })}
        />

        <h1 className={`${authStyles.title} text-center`}>{t("ve.title")}</h1>
        <p className={`${authStyles.subtitle} text-center max-w-xs`}>
          {t("code.sentTo", { email })}
        </p>

        <div className="mt-6 w-full flex justify-center">
          <InputOTP
            maxLength={OTP_LENGTH}
            value={code}
            onChange={handleChange}
            autoFocus
            inputMode="numeric"
            pattern="^[0-9]+$"
            disabled={verifying}
            containerClassName="gap-2"
          >
            <InputOTPGroup className="gap-2">
              {Array.from({ length: OTP_LENGTH }, (_, i) => (
                <InputOTPSlot
                  key={i}
                  index={i}
                  className="h-14 w-11 text-lg font-bold border-[1.5px] border-border first:border-l rounded-xl first:rounded-xl last:rounded-xl bg-input"
                />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>

        <p className={`${authStyles.footnote} mt-4`}>
          {verifying ? t("code.verifying") : t("code.auto")}
        </p>

        <Button
          onClick={() => verify(code)}
          disabled={verifying || code.length !== OTP_LENGTH}
          className={`${authStyles.primaryButton} mt-6`}
        >
          {verifying ? t("code.verifying") : t("code.verify")}
        </Button>

        <div className="mt-5 text-center">
          {secondsLeft > 0 ? (
            <p className={authStyles.footnote}>
              {t("code.resendIn", { s: secondsLeft })}
            </p>
          ) : (
            <button
              type="button"
              onClick={resend}
              disabled={resending}
              className={`text-[13px] ${authStyles.link} disabled:opacity-50`}
            >
              {resending ? t("fp.sending") : t("code.resend")}
            </button>
          )}
        </div>

        <p className={`${authStyles.footnote} mt-2`}>
          {t("code.wrongEmail")}{" "}
          <Link
            to="/register"
            onClick={() => clearVerifyEmailPending()}
            className={authStyles.link}
          >
            {t("code.startOver")}
          </Link>
        </p>
      </div>
    </AuthScreen>
  );
}
