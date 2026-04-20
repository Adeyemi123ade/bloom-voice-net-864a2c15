import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import MobileFrame from "@/components/MobileFrame";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const schema = z.object({
  email: z.string().trim().email({ message: "Enter a valid email address" }).max(255),
});

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = schema.safeParse({ email });
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    setError(undefined);
    setSubmitting(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(result.data.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSubmitting(false);
    if (err) {
      toast({ title: "Couldn't send reset email", description: err.message, variant: "destructive" });
      return;
    }
    setSent(true);
    toast({ title: "Reset link sent", description: `Check ${result.data.email} for instructions.` });
  };

  return (
    <MobileFrame>
      <div className="h-full w-full flex flex-col px-4 pt-5 pb-4 overflow-y-auto">

        <div className="mt-2">
          <h1 className="text-[18px] font-bold text-foreground leading-tight">
            Forgot your password?
          </h1>
          <p className="text-[11px] text-muted-foreground mt-1">
            Enter your email and we'll send you a reset link.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-3 flex-1 flex flex-col">
          <div>
            <Label htmlFor="email" className="text-[10px] text-muted-foreground">
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
              className="mt-1 h-9 text-xs bg-input border-border text-foreground placeholder:text-muted-foreground"
              aria-invalid={!!error}
            />
            {error && <p className="text-[10px] text-destructive mt-1">{error}</p>}
            {sent && (
              <p className="text-[10px] text-accent mt-2">
                If an account exists for {email}, a reset link is on its way.
              </p>
            )}
          </div>

          <div className="mt-auto pt-3">
            <Button
              type="submit"
              disabled={submitting}
              className="w-full h-8 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg"
            >
              {submitting ? "Sending…" : "Send reset link"}
            </Button>
            <p className="text-[10px] text-muted-foreground text-center mt-2">
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
