import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, KeyRound } from "lucide-react";
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
 * Verify the password-reset OTP. On success Supabase establishes a recovery
 * session and we route the user to /reset-password to choose a new password.
 *
 * Email is passed via `location.state.email`. If missing, we send the user
 * back to /forgot-password to request a fresh code.
 */
export default function VerifyResetCode() {
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
    document.title = "Enter reset code — ChiChat";
  }, []);

  useEffect(() => {
    if (!email) navigate("/forgot-password", { replace: true });
  }, [email, navigate]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  const verify = async (codeValue: string) => {
    if (!email || codeValue.length !== 6 || verifying) return;
    setVerifying(true);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: codeValue,
      type: "recovery",
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
    // Recovery session is now active — go straight to set-password screen.
    navigate("/reset-password", { replace: true });
  };

  const handleChange = (value: string) => {
    setCode(value);
    if (value.length === 6 && !autoSubmitted.current) {
      autoSubmitted.current = true;
      verify(value);
    }
  };

  const resend = async () => {
    if (!email || secondsLeft > 0) return;
    setResending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
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
            onClick={() => navigate("/forgot-password")}
            aria-label="Back"
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary transition-colors -ml-1"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
        </div>

        <div className="flex-1 flex flex-col px-6 pt-2 pb-6 items-center">
          <span className="w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center mb-5 mt-4">
            <KeyRound className="w-8 h-8 text-primary" />
          </span>

          <h1 className="text-xl font-bold text-foreground text-center">
            Enter your code
          </h1>
          <p className="text-base text-muted-foreground text-center mt-2 leading-relaxed max-w-xs">
            We sent a 6-digit code to{" "}
            <span className="text-foreground font-semibold">{email}</span>.
            Enter it below to set a new password.
          </p>

          <div className="mt-7">
            <InputOTP
              maxLength={6}
              value={code}
              onChange={handleChange}
              autoFocus
              inputMode="numeric"
              pattern="^[0-9]+$"
              disabled={verifying}
              containerClassName="gap-2"
            >
              <InputOTPGroup className="gap-2">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot
                    key={i}
                    index={i}
                    className="h-12 w-11 text-lg font-bold border-r border-border first:border-l rounded-md bg-input"
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
            <Link to="/forgot-password" className="text-accent font-semibold hover:underline">
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
