import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { Eye, EyeOff } from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const schema = z
  .object({
    password: z
      .string()
      .min(8, { message: "Password must be at least 8 characters" })
      .max(72)
      .regex(/[A-Z]/, { message: "Include at least one uppercase letter" })
      .regex(/[0-9]/, { message: "Include at least one number" }),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    path: ["confirm"],
    message: "Passwords don't match",
  });

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase auto-establishes a recovery session from the URL hash.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = schema.safeParse({ password, confirm });
    if (!result.success) {
      const fe: { password?: string; confirm?: string } = {};
      result.error.issues.forEach((i) => {
        const k = i.path[0] as "password" | "confirm";
        if (!fe[k]) fe[k] = i.message;
      });
      setErrors(fe);
      return;
    }
    setErrors({});
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password: result.data.password });
    setSubmitting(false);
    if (error) {
      toast({ title: "Couldn't reset password", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Password updated", description: "You're signed in." });
    navigate("/home");
  };

  return (
    <MobileFrame>
      <div className="h-full w-full flex flex-col px-4 pt-5 pb-4 overflow-y-auto">

        <div className="mt-2">
          <h1 className="text-[18px] font-bold text-foreground leading-tight">
            Set a new password
          </h1>
          <p className="text-[11px] text-muted-foreground mt-1">
            {ready
              ? "Choose a strong password you haven't used before."
              : "Open this page from the reset link in your email."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-3 flex-1 flex flex-col">
          <div className="space-y-2.5">
            <div>
              <Label htmlFor="password" className="text-[10px] text-muted-foreground">
                New password
              </Label>
              <div className="relative mt-1">
                <Input
                  id="password"
                  type={showPwd ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  maxLength={72}
                  className="h-9 text-xs bg-input border-border text-foreground placeholder:text-muted-foreground pr-10"
                  aria-invalid={!!errors.password}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  aria-label={showPwd ? "Hide password" : "Show password"}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPwd ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-[10px] text-destructive mt-1">{errors.password}</p>
              )}
            </div>

            <div>
              <Label htmlFor="confirm" className="text-[10px] text-muted-foreground">
                Confirm password
              </Label>
              <Input
                id="confirm"
                type={showPwd ? "text" : "password"}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Re-enter password"
                maxLength={72}
                className="mt-1 h-9 text-xs bg-input border-border text-foreground placeholder:text-muted-foreground"
                aria-invalid={!!errors.confirm}
              />
              {errors.confirm && (
                <p className="text-[10px] text-destructive mt-1">{errors.confirm}</p>
              )}
            </div>
          </div>

          <div className="mt-auto pt-3">
            <Button
              type="submit"
              disabled={submitting || !ready}
              className="w-full h-8 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg"
            >
              {submitting ? "Updating…" : "Update password"}
            </Button>
          </div>
        </form>
      </div>
    </MobileFrame>
  );
}
