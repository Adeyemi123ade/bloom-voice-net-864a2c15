import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, MailCheck } from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import { Button } from "@/components/ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const OTP_LENGTH = 8;

/**
 * Verify email with a 6-digit OTP after signup.
 * The email is passed via `location.state.email`. If missing, we route the
 * user back to /register so they can start over (we never expose technical
 * details, per project rule).
 */
export default function VerifyEmail() {
  const navigate = useNavigate();
  const location = useLocation();
  const stateEmail = (location.state as { email?: string } | null)?.email ?? "";

  const [email] = useState(stateEmail);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(45);
  const autoSubmitted = useRef(false);

  useEffect(() => {
    document.title = "Verify email — ChiChat";
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
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: codeValue,
      type: "signup",
    });
    setVerifying(false);
    if (error) {
      setCode("");
      autoSubmitted.current = false;
      toast({
        title: "Wrong or expired code",
        description: "Double-check the code in your email and try again.",
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Email verified — welcome to ChiChat!" });
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
        title: "Couldn't send a new code",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "New code sent" });
    setSecondsLeft(45);
  };

  if (!email) return null;

  return (
    <MobileFrame>
      <div className="h-full w-full flex flex-col bg-background overflow-y-auto">
        <div className="px-4 pt-4">
          <button
            onClick={() => navigate("/register")}
            aria-label="Back"
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary transition-colors -ml-1"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
        </div>

        <div className="flex-1 flex flex-col px-6 pt-2 pb-6 items-center">
          <span className="w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center mb-5 mt-4">
            <MailCheck className="w-8 h-8 text-primary" />
          </span>

          <h1 className="text-xl font-bold text-foreground text-center">
            Check your email
          </h1>
          <p className="text-base text-muted-foreground text-center mt-2 leading-relaxed max-w-xs">
            We sent an {OTP_LENGTH}-digit code to{" "}
            <span className="text-foreground font-semibold">{email}</span>.
            Enter it below to finish setting up your account.
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

          <p className="text-sm text-muted-foreground mt-3 text-center">
            Wrong email?{" "}
            <Link to="/register" className="text-accent font-semibold hover:underline">
              Start over
            </Link>
          </p>

          <Button
            onClick={() => verify(code)}
            disabled={verifying || code.length !== 6}
            className="w-full max-w-xs h-11 mt-8 text-base bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg"
          >
            {verifying ? "Verifying…" : "Verify"}
          </Button>
        </div>
      </div>
    </MobileFrame>
  );
}
