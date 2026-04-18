import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const OTP_LEN = 6;
const RESEND_SECONDS = 30;

export default function Verify() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as { email?: string; name?: string };
  const email = state.email ?? "";
  const name = state.name ?? "";

  const [digits, setDigits] = useState<string[]>(Array(OTP_LEN).fill(""));
  const [countdown, setCountdown] = useState(RESEND_SECONDS);
  const [verifying, setVerifying] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!email) {
      navigate("/register", { replace: true });
    }
  }, [email, navigate]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  const handleChange = (idx: number, value: string) => {
    const cleaned = value.replace(/\D/g, "");
    if (!cleaned) {
      const next = [...digits];
      next[idx] = "";
      setDigits(next);
      return;
    }
    const next = [...digits];
    // Handle paste of multiple digits
    if (cleaned.length > 1) {
      const chars = cleaned.slice(0, OTP_LEN - idx).split("");
      chars.forEach((c, i) => (next[idx + i] = c));
      setDigits(next);
      const focusIdx = Math.min(idx + chars.length, OTP_LEN - 1);
      inputs.current[focusIdx]?.focus();
      return;
    }
    next[idx] = cleaned;
    setDigits(next);
    if (idx < OTP_LEN - 1) inputs.current[idx + 1]?.focus();
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[idx] && idx > 0) {
      inputs.current[idx - 1]?.focus();
    }
  };

  const code = digits.join("");
  const isComplete = code.length === OTP_LEN;

  const handleVerify = async () => {
    if (!isComplete) return;
    setVerifying(true);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "signup",
    });
    setVerifying(false);
    if (error) {
      toast({
        title: "Verification failed",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Verified", description: "Your email is confirmed." });
    navigate("/welcome", { state: { name, email } });
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    const { error } = await supabase.auth.resend({ type: "signup", email });
    if (error) {
      toast({ title: "Couldn't resend", description: error.message, variant: "destructive" });
      return;
    }
    setCountdown(RESEND_SECONDS);
    toast({ title: "Code resent", description: `New code sent to ${email}.` });
  };

  return (
    <MobileFrame>
      <div className="h-full w-full flex flex-col px-6 pt-12 pb-8">
        <button
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-secondary transition-colors -ml-2"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>

        <div className="mt-6">
          <h1 className="text-[22px] font-bold text-foreground leading-tight">
            Verify your email
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            We sent a 6-digit code to{" "}
            <span className="text-foreground font-medium">{email || "your email"}</span>.
          </p>
        </div>

        <div className="mt-10 flex justify-between gap-2">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => (inputs.current[i] = el)}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={OTP_LEN}
              value={d}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className="w-12 h-14 text-center text-xl font-semibold rounded-lg bg-input border border-border text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition"
            />
          ))}
        </div>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          Didn't get a code?{" "}
          {countdown > 0 ? (
            <span>Resend in {countdown}s</span>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              className="text-accent font-semibold hover:underline"
            >
              Resend code
            </button>
          )}
        </div>

        <div className="mt-auto pt-8">
          <Button
            onClick={handleVerify}
            disabled={!isComplete || verifying}
            className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg"
          >
            {verifying ? "Verifying…" : "Verify"}
          </Button>
        </div>
      </div>
    </MobileFrame>
  );
}
