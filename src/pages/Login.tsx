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


const loginSchema = z.object({
  // Phone-number sign-in removed from this form — email only, to avoid
  // confusing users with two different identifier formats. The backend
  // (sign-in-with-identifier) still supports phone lookups for anything
  // else that might use it; this page just no longer offers it.
  identifier: z.string().trim().min(1, { message: "Enter your email" }).max(255),
  password: z.string().min(1, { message: "Password is required" }).max(72),
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
  return { data: null, errorCode: "wrong_password" };
}

export default function Login() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
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
    navigate("/home", { replace: true });
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
      ? "Enter a valid email address"
      : null;
  const emailError = liveEmailError ?? errors.identifier;
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogle = async () => {
    setGoogleLoading(true);
    const { error } = await startGoogleAuth();
    if (error) {
      setGoogleLoading(false);
      toast({
        title: "Google sign-in didn't work",
        description: "We couldn't connect to your Google account. Please try again, or sign in with your email and password.",
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
      setErrors({ identifier: "Enter a valid email address" });
      return;
    }
    setErrors({});
    setSubmitting(true);
    // Race the sign-in against a 10s timeout so the UI never hangs forever
    // if the network or auth service stalls.
    const timeoutPromise = new Promise<{ error: Error }>((resolve) =>
      setTimeout(
        () => resolve({ error: new Error("Sign in timed out. Please check your connection and try again.") }),
        10000,
      ),
    );
    const signInPromise = (async () => {
      // normalizedIdentifier is always a valid email here (normalizeIdentifier
      // rejects anything else) — this form no longer offers phone sign-in.
      const signedIn = await signInDirect(normalizedIdentifier, result.data.password);
      return { data: signedIn.errorCode ? { error: signedIn.errorCode } : signedIn.data, error: null };
    })();
    const { data, error } = (await Promise.race([signInPromise, timeoutPromise])) as { data?: any; error: Error | null };
    setSubmitting(false);
    const errorCode = (data as { error?: string } | null)?.error;
    if (error || errorCode) {
      const raw = (errorCode || error?.message || "").toLowerCase();
      let title = "Account not recognized";
      let description = "We couldn't sign you in with those details. Check them and try again, or create a new account.";

      if (raw.includes("email_not_registered")) {
        title = "Email not registered";
        description = "This email does not have a ChiChat account yet. Create a new account to continue.";
      } else if (raw.includes("wrong_password")) {
        // Supabase deliberately returns the same generic error for "wrong
        // password" and "no account with this email" (anti-enumeration —
        // it should be impossible to tell which case you're in from the
        // login form). Don't assert the account exists; that's a real,
        // specific claim we can't actually verify, and it's flatly wrong
        // when the account doesn't exist (e.g. was deleted).
        title = "Incorrect email or password";
        description = "Double-check your details and try again, or reset your password.";
      } else if (raw.includes("invalid_identifier") || raw.includes("missing_details")) {
        title = "Check your details";
        description = "Enter a valid email, then try again.";
      } else if (raw.includes("not confirmed") || raw.includes("confirm")) {
        title = "Email not verified yet";
        description = "Please check your inbox for the verification code we sent you.";
      } else if (raw.includes("rate") || raw.includes("too many")) {
        title = "Too many attempts";
        description = "Please wait a moment and try again.";
      } else if (raw.includes("network") || raw.includes("fetch")) {
        title = "No internet connection";
        description = "Check your connection and try again.";
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
    toast({ title: "Welcome back" });
    navigate("/home");
  };

  return (
    <AuthScreen onBack={() => navigate("/")}>
      <div className="mt-1">
        <BrandHero className="mb-5" />
        <h1 className={authStyles.title}>Welcome back</h1>
        <p className={authStyles.subtitle}>Sign in to continue to Chichat.</p>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col">
        <div className={authStyles.fieldGap}>
          <div>
            <Label htmlFor="identifier" className={authStyles.label}>
              Email
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
            {emailError && <p className={authStyles.error}>{emailError}</p>}
          </div>

          <div>
            <Label htmlFor="password" className={authStyles.label}>
              Password
            </Label>
            <div className="relative mt-1.5">
              <Input
                id="password"
                type={showPwd ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                maxLength={72}
                className="pr-11"
                aria-invalid={!!errors.password}
              />
              <button
                type="button"
                onClick={() => setShowPwd((s) => !s)}
                aria-label={showPwd ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPwd ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
              </button>
            </div>
            {errors.password && <p className={authStyles.error}>{errors.password}</p>}
            <div className="text-right mt-2">
              <Link to="/forgot-password" className={`text-[13px] ${authStyles.link}`}>
                Forgot password?
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
            {submitting ? "Signing in…" : "Sign in"}
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
            {googleLoading ? "Connecting…" : "Continue with Google"}
          </Button>
          <p className={`${authStyles.footnote} mt-4`}>
            Don't have an account?{" "}
            <Link to="/register" className={authStyles.link}>
              Create one
            </Link>
          </p>
        </div>
      </form>
    </AuthScreen>
  );
}
