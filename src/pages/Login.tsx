import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { z } from "zod";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";


const loginSchema = z.object({
  identifier: z.string().trim().min(1, { message: "Enter your email or phone number" }).max(255),
  password: z.string().min(1, { message: "Password is required" }).max(72),
});

type FormErrors = Partial<Record<"identifier" | "password", string>>;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function normalizeIdentifier(value: string) {
  const trimmed = value.trim();
  if (EMAIL_RE.test(trimmed)) return trimmed.toLowerCase();
  if (trimmed.replace(/\D/g, "").length >= 7) return trimmed;
  return null;
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
    if (!authLoading && user) navigate("/home", { replace: true });
  }, [authLoading, user, navigate]);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogle = async () => {
    setGoogleLoading(true);
    const CANONICAL_ORIGIN = "https://chichatapp.com";
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${CANONICAL_ORIGIN}/auth/google-return`,
    });
    if (result.error) {
      setGoogleLoading(false);
      toast({
        title: "Google sign-in didn't work",
        description: "We couldn't connect to your Google account. Please try again, or sign in with your email and password.",
        variant: "destructive",
      });
    }
    // On success the browser redirects; nothing else to do here.
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
      setErrors({ identifier: "Enter a valid email or full phone number" });
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
      if (EMAIL_RE.test(normalizedIdentifier)) {
        const signedIn = await signInDirect(normalizedIdentifier, result.data.password);
        return { data: signedIn.errorCode ? { error: signedIn.errorCode } : signedIn.data, error: null };
      }

      const invoked = await supabase.functions.invoke("sign-in-with-identifier", {
        body: { identifier: normalizedIdentifier, password: result.data.password },
      });
      if (!invoked.error) return { data: invoked.data, error: null };
      return { data: { error: "phone_signin_unavailable" }, error: null };
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
      } else if (raw.includes("phone_not_registered")) {
        title = "Phone number not registered";
        description = "This phone number is not on ChiChat yet. Create a new account to continue.";
      } else if (raw.includes("phone_signin_unavailable")) {
        title = "Phone sign-in not ready";
        description = "Sign in with your email for now. Your phone number can still be used after the backend update finishes.";
      } else if (raw.includes("phone_ambiguous")) {
        title = "Enter full phone number";
        description = "Add the country code, for example +234…, so we can find the exact account.";
      } else if (raw.includes("wrong_password")) {
        title = "Wrong password";
        description = "This account exists, but the password is not correct. Try again or reset your password.";
      } else if (raw.includes("invalid_identifier") || raw.includes("missing_details")) {
        title = "Check your details";
        description = "Enter a valid email or full phone number, then try again.";
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
    toast({ title: "Welcome back" });
    navigate("/home");
  };

  return (
    <MobileFrame>
      <div className="h-full w-full flex flex-col px-4 pt-5 pb-4 overflow-y-auto">
        <button
          onClick={() => navigate("/")}
          aria-label="Back"
          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary transition-colors -ml-1"
        >
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>

        <div className="mt-2">
          <h1 className="text-[18px] font-bold text-foreground leading-tight">
            Welcome back
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Sign in to continue to Chichat.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-3 flex-1 flex flex-col">
          <div className="space-y-2.5">
            <div>
              <Label htmlFor="identifier" className="text-2xs text-muted-foreground">
                Email or phone number
              </Label>
              <Input
                id="identifier"
                type="text"
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="you@example.com or +2348012345678"
                maxLength={255}
                className="mt-1 h-9 text-xs bg-input border-border text-foreground placeholder:text-muted-foreground"
                aria-invalid={!!errors.identifier}
              />
              {errors.identifier && (
                <p className="text-2xs text-destructive mt-1">{errors.identifier}</p>
              )}
            </div>

            <div>
              <Label htmlFor="password" className="text-2xs text-muted-foreground">
                Password
              </Label>
              <div className="relative mt-1">
                <Input
                  id="password"
                  type={showPwd ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
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
                <p className="text-2xs text-destructive mt-1">{errors.password}</p>
              )}
              <div className="text-right mt-1.5">
                <Link to="/forgot-password" className="text-2xs text-accent font-semibold hover:underline">
                  Forgot password?
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-auto pt-3">
            <Button
              type="submit"
              disabled={submitting}
              className="w-full h-8 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg"
            >
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
            <div className="flex items-center gap-2 my-2.5">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider">or</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <Button
              type="button"
              onClick={handleGoogle}
              disabled={googleLoading}
              variant="outline"
              className="w-full h-8 text-xs font-semibold rounded-lg gap-2"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.93l3.66-2.83z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"/>
              </svg>
              {googleLoading ? "Connecting…" : "Continue with Google"}
            </Button>
            <p className="text-2xs text-muted-foreground text-center mt-2">
              Don't have an account?{" "}
              <Link to="/register" className="text-accent font-semibold hover:underline">
                Create one
              </Link>
            </p>
          </div>
        </form>
      </div>
    </MobileFrame>
  );
}
