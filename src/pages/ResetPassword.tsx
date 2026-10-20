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
import PasswordStrengthBar from "@/components/PasswordStrengthBar";
import PasswordMatchHint from "@/components/PasswordMatchHint";
import { firstUnmetPasswordRule } from "@/lib/passwordStrength";
import { clearRecoveryPending } from "@/lib/recoveryPending";
import { useLanguage } from "@/lib/i18n/context";

const schema = z
  .object({
    password: z
      .string()
      .max(72)
      // Same rules the live hint under the field shows (src/lib/passwordStrength).
      .superRefine((p, ctx) => {
        const unmet = firstUnmetPasswordRule(p);
        if (unmet) ctx.addIssue({ code: "custom", message: unmet.messageKey });
      }),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    path: ["confirm"],
    message: "reg.passwordsDontMatch",
  });

/**
 * Set a new password. Reached after the user verifies the OTP code on
 * /verify-reset-code, which establishes a recovery session. If somehow the
 * user lands here without a session, we route them back to /forgot-password.
 */
export default function ResetPassword() {
  const { t, tx } = useLanguage();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    document.title = `${t("rp.pageTitle")} — ChiChat`;
  }, [t]);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) {
        setReady(true);
      } else {
        navigate("/forgot-password", { replace: true });
      }
      setChecking(false);
    });
    return () => {
      mounted = false;
    };
  }, [navigate]);

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
    const { data, error } = await supabase.auth.updateUser({ password: result.data.password });
    setSubmitting(false);
    if (error) {
      toast({ title: t("rp.cantReset"), description: error.message, variant: "destructive" });
      return;
    }
    if (data.user?.id) clearRecoveryPending(data.user.id);
    toast({ title: t("rp.updated"), description: t("rp.signedIn") });
    navigate("/home");
  };

  if (checking || !ready) return null;

  return (
    <MobileFrame>
      <div className="h-full w-full flex flex-col px-5 pt-5 pb-5 overflow-y-auto">
        <div className="mt-2">
          <h1 className="text-xl font-bold text-foreground leading-tight">
            {t("rp.title")}
          </h1>
          <p className="text-base text-muted-foreground mt-1">
            {t("rp.subtitle")}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 flex-1 flex flex-col">
          <div className="space-y-3">
            <div>
              <Label htmlFor="password" className="text-sm text-muted-foreground">
                {t("rp.new")}
              </Label>
              <div className="relative mt-1">
                <Input
                  id="password"
                  type={showPwd ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("reg.passwordPlaceholder")}
                  maxLength={72}
                  autoFocus
                  className="h-11 text-base bg-input border-border text-foreground placeholder:text-muted-foreground pr-10"
                  aria-invalid={!!errors.password}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  aria-label={showPwd ? t("auth.hidePassword") : t("auth.showPassword")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <PasswordStrengthBar password={password} />
              {errors.password && (
                <p className="text-sm text-destructive mt-1">{tx(errors.password)}</p>
              )}
            </div>

            <div>
              <Label htmlFor="confirm" className="text-sm text-muted-foreground">
                {t("reg.confirm")}
              </Label>
              <Input
                id="confirm"
                type={showPwd ? "text" : "password"}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={t("reg.confirmPlaceholder")}
                maxLength={72}
                className="mt-1 h-11 text-base bg-input border-border text-foreground placeholder:text-muted-foreground"
                aria-invalid={!!errors.confirm}
              />
              {errors.confirm ? (
                <p className="text-sm text-destructive mt-1">{tx(errors.confirm)}</p>
              ) : (
                <PasswordMatchHint password={password} confirm={confirm} />
              )}
            </div>
          </div>

          <div className="mt-auto pt-4">
            <Button
              type="submit"
              disabled={submitting}
              className="w-full h-11 text-base bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg"
            >
              {submitting ? t("rp.updating") : t("rp.update")}
            </Button>
          </div>
        </form>
      </div>
    </MobileFrame>
  );
}
