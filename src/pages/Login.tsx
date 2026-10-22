import { takeAfterSignIn } from "@/lib/afterSignIn";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { z } from "zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import AuthScreen, { AuthDivider } from "@/components/auth/AuthScreen";
import { authStyles } from "@/components/auth/authStyles";
import BrandHero from "@/components/BrandHero";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { clearRecoveryPending, isRecoveryPending } from "@/lib/recoveryPending";
import { startGoogleAuth } from "@/lib/googleAuth";
import { googleErrorText } from "@/lib/googleErrorText";
import { reportProblem } from "@/lib/errorReport";
import { useLanguage } from "@/lib/i18n/context";


const loginSchema = z.object({
  // Phone-number sign-in removed from this form — email only, to avoid
  // confusing users with two different identifier formats. The backend
  // (sign-in-with-identifier) still supports phone lookups for anything
  // else that might use it; this page just no longer offers it.
  // Messages are keys of translated text (src/lib/i18n), shown with tx().
  identifier: z.string().trim().min(1, { message: "err.enterEmail" }).max(255),
  password: z.string().min(1, { message: "err.passwordRequired" }).max(72),
});

type FormErrors = Partial<Record<"identifier" | "password", string>>;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function normalizeIdentifier(value: string) {
  const trimmed = value.trim();
  return EMAIL_RE.test(trimmed) ? trimmed.toLowerCase() : null;
}

async function signInDirect(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (!error) return { data, errorCode: "" };
  const msg = (error.message || "").toLowerCase();
  if (msg.includes("confirm") || msg.includes("verified")) return { data: null, errorCode: "email_not_verified" };
  // Only Supabase's own "wrong email or password" answer means that. Anything
  // else (server down, API key refused, network, rate limit) used to show as
  // "wrong password" too, which hid the real cause: pass it on as it is.
  const code = (error as { code?: string }).code ?? "";
  if (code === "invalid_credentials" || msg.includes("invalid login credentials")) return { data: null, errorCode: "wrong_password" };
  reportProblem("login", `signInWithPassword: ${error.status ?? ""} ${code} ${error.message}`.trim());
  return { data: null, errorCode: error.message || "unknown_error" };
}

export default function Login() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { t, tx } = useLanguage();
  useEffect(() => {
    if (authLoading || !user) return;
    // A session can exist for an account that hasn't confirmed its email OTP
    // yet — don't treat that as "already logged in".
    if (!user.email_confirmed_at) {
      navigate("/verify-email", { replace: true, state: { email: user.email } });
      return;
    }
    // Same trap, for an unfinished password reset: verifying a recovery code
    // establishes a real session before a new password is set.
    if (isRecoveryPending(user.id)) {
      navigate("/reset-password", { replace: true });
      return;
    }
    navigate(takeAfterSignIn(), { replace: true });
  }, [authLoading, user, navigate]);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  // Live email check: starts once the user leaves the field (so it doesn't
  // nag mid-typing), then updates on every keystroke until it's valid.
  const [emailTouched, setEmailTouched] = useState(false);
  const liveEmailError =
    emailTouched && identifier.trim() && !EMAIL_RE.test(identifier.trim())
      ? "err.validEmail"
      : null;
  const emailError = liveEmailError ?? errors.identifier;
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogle = async () => {
    setGoogleLoading(true);
    const { error, signedIn, cancelled } = await startGoogleAuth();
    if (signedIn) {
      // Native picker: already signed in. The account check sends a
      // returning account to the chats and a new one to the form.
      navigate("/auth/google-return", { replace: true });
      return;
    }
    if (cancelled) {
      setGoogleLoading(false);
      return;
    }
    if (error) {
      setGoogleLoading(false);
      toast({
        title: t("login.googleFailTitle"),
        description: googleErrorText(error, "login.googleFailBody").description,
        variant: "destructive",
      });
    }
    // On success: web redirects the page; native opens an external tab and
    // GoogleOAuthReturnListener handles the return. Nothing else to do here.
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = loginSchema.safeParse({ identifier, password });
    if (!result.success) {
      const fieldErrors: FormErrors = {};
      result.error.issues.forEach((issue) => {
        const key = issue.path[0] as keyof FormErrors;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }
    const normalizedIdentifier = normalizeIdentifier(result.data.identifier);
    if (!normalizedIdentifier) {
      setErrors({ identifier: "err.validEmail" });
      return;
    }
    setErrors({});
    setSubmitting(true);
    // Race the sign-in against a 10s timeout so the UI never hangs forever
    // if the network or auth service stalls.
    const timeoutPromise = new Promise<{ error: Error }>((resolve) =>
      setTimeout(
        () => resolve({ error: new Error("sign_in_timed_out") }),
        10000,
      ),
    );
    const signInPromise = (async () => {
      // normalizedIdentifier is always a valid email here (normalizeIdentifier
      // rejects anything else) — this form no longer offers phone sign-in.
      const signedIn = await signInDirect(normalizedIdentifier, result.data.password);
      return { data: signedIn.errorCode ? { error: signedIn.errorCode } : signedIn.data, error: null };
    })();
    const { data, error } = (await Promise.race([signInPromise, timeoutPromise])) as {
      data?: { session?: { access_token?: string; refresh_token?: string; user?: { id?: string } } | null } | null;
      error: Error | null;
    };
    setSubmitting(false);
    const errorCode = (data as { error?: string } | null)?.error;
    if (error || errorCode) {
      const raw = (errorCode || error?.message || "").toLowerCase();
      let title = t("login.notRecognizedTitle");
      let description = t("login.notRecognizedBody");

      if (raw.includes("sign_in_timed_out")) {
        // Used to fall through to "Account not recognized".
        title = t("login.offlineTitle");
        description = t("login.timeout");
      } else if (raw.includes("email_not_registered")) {
        title = t("login.notRegisteredTitle");
        description = t("login.notRegisteredBody");
      } else if (raw.includes("wrong_password")) {
        // Supabase deliberately returns the same generic error for "wrong
        // password" and "no account with this email" (anti-enumeration —
        // it should be impossible to tell which case you're in from the
        // login form). Don't assert the account exists; that's a real,
        // specific claim we can't actually verify, and it's flatly wrong
        // when the account doesn't exist (e.g. was deleted).
        title = t("login.wrongTitle");
        description = t("login.wrongBody");
      } else if (raw.includes("invalid_identifier") || raw.includes("missing_details")) {
        title = t("login.checkTitle");
        description = t("login.checkBody");
      } else if (raw.includes("not confirmed") || raw.includes("confirm")) {
        title = t("login.notVerifiedTitle");
        description = t("login.notVerifiedBody");
      } else if (raw.includes("rate") || raw.includes("too many")) {
        title = t("login.tooManyTitle");
        description = t("login.tooManyBody");
      } else if (raw.includes("network") || raw.includes("fetch")) {
        title = t("login.offlineTitle");
        description = t("login.offlineBody");
      } else {
        // Not one we know: show the real reason instead of guessing.
        title = t("eb.title");
        description = `${t("auth.tryAgain")} ${t("google.detail", { detail: (errorCode || error?.message || "").slice(0, 80) })}`;
      }

      toast({ title, description, variant: "destructive" });
      return;
    }
    if (data?.session?.access_token && data?.session?.refresh_token) {
      await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
    }
    // A deliberate, credentialed login always supersedes any earlier
    // abandoned password-reset attempt for this account.
    if (data?.session?.user?.id) {
      clearRecoveryPending(data.session.user.id as string);
    }
    toast({ title: t("login.title") });
    navigate(takeAfterSignIn());
  };

  return (
    <AuthScreen onBack={() => navigate("/")}>
      <div className="mt-1">
        <BrandHero className="mb-5" />
        <h1 className={authStyles.title}>{t("login.title")}</h1>
        <p className={authStyles.subtitle}>{t("login.subtitle")}</p>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col">
        <div className={authStyles.fieldGap}>
          <div>
            <Label htmlFor="identifier" className={authStyles.label}>
              {t("login.email")}
            </Label>
            <Input
              id="identifier"
              type="email"
              autoComplete="email"
              value={identifier}
              onChange={(e) => {
                setIdentifier(e.target.value);
                if (errors.identifier) setErrors((prev) => ({ ...prev, identifier: undefined }));
              }}
              onBlur={() => setEmailTouched(true)}
              placeholder="you@example.com"
              maxLength={255}
              className="mt-1.5"
              aria-invalid={!!emailError}
            />
            {emailError && <p className={authStyles.error}>{tx(emailError)}</p>}
          </div>

          <div>
            <Label htmlFor="password" className={authStyles.label}>
              {t("auth.password")}
            </Label>
            <div className="relative mt-1.5">
              <Input
                id="password"
                type={showPwd ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("login.passwordPlaceholder")}
                maxLength={72}
                className="pr-11"
                aria-invalid={!!errors.password}
              />
              <button
                type="button"
                onClick={() => setShowPwd((s) => !s)}
                aria-label={showPwd ? t("auth.hidePassword") : t("auth.showPassword")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPwd ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
              </button>
            </div>
            {errors.password && <p className={authStyles.error}>{tx(errors.password)}</p>}
            <div className="text-right mt-2">
              <Link to="/forgot-password" className={`text-[13px] ${authStyles.link}`}>
                {t("login.forgot")}
              </Link>
            </div>
          </div>
        </div>

        <div className="pt-5">
          <Button
            type="submit"
            // Enabled once both fields have something in them. Whether the
            // password is right can only be checked by the server on submit.
            disabled={submitting || !identifier.trim() || !password}
            className={`${authStyles.primaryButton} gap-1.5 disabled:opacity-60`}
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? t("login.signingIn") : t("login.signIn")}
          </Button>
          <AuthDivider />
          <Button
            type="button"
            onClick={handleGoogle}
            disabled={googleLoading}
            variant="outline"
            className={authStyles.secondaryButton}
          >
            <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.93l3.66-2.83z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"/>
            </svg>
            {googleLoading ? t("auth.connecting") : t("auth.google")}
          </Button>
          <p className={`${authStyles.footnote} mt-4`}>
            {t("login.noAccount")}{" "}
            <Link to="/register" className={authStyles.link}>
              {t("login.createOne")}
            </Link>
          </p>
        </div>
      </form>
    </AuthScreen>
  );
}
