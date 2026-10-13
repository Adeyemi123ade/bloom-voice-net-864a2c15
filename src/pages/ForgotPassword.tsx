import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import AuthScreen from "@/components/auth/AuthScreen";
import { authStyles } from "@/components/auth/authStyles";
import BrandHero from "@/components/BrandHero";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { checkEmailStatus } from "@/lib/checkEmail";

const schema = z.object({
  email: z.string().trim().email({ message: "Enter a valid email address" }).max(255),
});

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = schema.safeParse({ email });
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    setError(undefined);
    setSubmitting(true);
    const status = await checkEmailStatus(result.data.email);
    if (status && !status.exists) {
      setSubmitting(false);
      setError("Account not recognized");
      return;
    }
    // No redirectTo — Supabase will send a 6-digit OTP code, not a magic link.
    const { error: err } = await supabase.auth.resetPasswordForEmail(result.data.email);
    setSubmitting(false);
    if (err) {
      toast({ title: "Couldn't send code", description: err.message, variant: "destructive" });
      return;
    }
    toast({ title: "Code sent", description: `Check ${result.data.email} for your 6-digit code.` });
    navigate("/verify-reset-code", { state: { email: result.data.email } });
  };

  return (
    <AuthScreen onBack={() => navigate("/login")}>
      <div className="mt-1">
        <BrandHero className="mb-5" />
        <h1 className={authStyles.title}>Forgot your password?</h1>
        <p className={authStyles.subtitle}>
          Enter your email and we'll send you a 6-digit code to reset it.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col">
        <div>
          <Label htmlFor="email" className={authStyles.label}>
            Email address
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            maxLength={255}
            autoFocus
            className="mt-1.5"
            aria-invalid={!!error}
          />
          {error && <p className={authStyles.error}>{error}</p>}
        </div>

        <div className="pt-5">
          <Button type="submit" disabled={submitting} className={authStyles.primaryButton}>
            {submitting ? "Sending…" : "Send code"}
          </Button>
          <p className={`${authStyles.footnote} mt-4`}>
            Remembered it?{" "}
            <Link to="/login" className={authStyles.link}>
              Sign in
            </Link>
          </p>
        </div>
      </form>
    </AuthScreen>
  );
}
