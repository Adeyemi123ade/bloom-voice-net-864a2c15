import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
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
    <MobileFrame>
      <div className="h-full w-full flex flex-col px-5 pt-5 pb-5 overflow-y-auto">
        <button
          onClick={() => navigate("/login")}
          aria-label="Back"
          className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary transition-colors -ml-1"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>

        <div className="mt-2">
          <h1 className="text-xl font-bold text-foreground leading-tight">
            Forgot your password?
          </h1>
          <p className="text-base text-muted-foreground mt-1">
            Enter your email and we'll send you a 6-digit code to reset it.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 flex-1 flex flex-col">
          <div>
            <Label htmlFor="email" className="text-sm text-muted-foreground">
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
              className="mt-1 h-11 text-base bg-input border-border text-foreground placeholder:text-muted-foreground"
              aria-invalid={!!error}
            />
            {error && <p className="text-sm text-destructive mt-1">{error}</p>}
          </div>

          <div className="mt-auto pt-4">
            <Button
              type="submit"
              disabled={submitting}
              className="w-full h-11 text-base bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg"
            >
              {submitting ? "Sending…" : "Send code"}
            </Button>
            <p className="text-sm text-muted-foreground text-center mt-3">
              Remembered it?{" "}
              <Link to="/login" className="text-accent font-semibold hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </form>
      </div>
    </MobileFrame>
  );
}
