import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { z } from "zod";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import BrandHero from "@/components/BrandHero";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toE164 } from "@/lib/phone";
import CountryPicker from "@/components/CountryPicker";
import { allCountries, type CountryEntry } from "@/lib/countries";
import PasswordStrengthBar from "@/components/PasswordStrengthBar";
import { checkEmailExists } from "@/lib/checkEmail";

const baseSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { message: "Name must be at least 2 characters" })
    .max(60, { message: "Name must be less than 60 characters" }),
  email: z
    .string()
    .trim()
    .email({ message: "Enter a valid email address" })
    .max(255, { message: "Email must be less than 255 characters" }),
  password: z
    .string()
    .min(8, { message: "Password must be at least 8 characters" })
    .max(72, { message: "Password must be less than 72 characters" })
    .regex(/[A-Z]/, { message: "Include at least one uppercase letter" })
    .regex(/[0-9]/, { message: "Include at least one number" }),
});

type FormErrors = Partial<
  Record<"name" | "email" | "phone" | "password" | "confirmPassword" | "country", string>
>;

/** Pick a sensible default country from the browser locale, falling back to US. */
function defaultCountry(): CountryEntry {
  const list = allCountries();
  try {
    const region = new Intl.Locale(navigator.language).maximize().region;
    const hit = region ? list.find((c) => c.code === region) : null;
    if (hit) return hit;
  } catch {
    /* ignore */
  }
  return list.find((c) => c.code === "US") ?? list[0];
}

export default function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const prefill = (location.state as { prefill?: { email?: string; name?: string; googleVerified?: boolean } } | null)?.prefill;
  const googleVerified = !!prefill?.googleVerified;
  const { user, loading: authLoading } = useAuth();
  useEffect(() => {
    // Don't redirect away when the user is mid-Google-completion: they're
    // signed in but their profile isn't finished yet.
    if (!authLoading && user && !googleVerified) navigate("/home", { replace: true });
  }, [authLoading, user, navigate, googleVerified]);

  const [name, setName] = useState(prefill?.name ?? "");
  const [email, setEmail] = useState(prefill?.email ?? "");
  const [country, setCountry] = useState<CountryEntry>(() => defaultCountry());
  const [phoneLocal, setPhoneLocal] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [emailChecking, setEmailChecking] = useState(false);

  // On blur: if the email is well-formed, ask the backend whether it's already
  // taken. We only set the inline error here — the form's own validation runs
  // on submit.
  const handleEmailBlur = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
      setErrors((prev) => ({ ...prev, email: "Enter a valid email address" }));
      return;
    }
    setEmailChecking(true);
    const exists = await checkEmailExists(trimmed);
    setEmailChecking(false);
    if (exists === true) {
      setErrors((prev) => ({ ...prev, email: "Email already exists — try signing in" }));
    } else if (exists === false) {
      setErrors((prev) => {
        const next = { ...prev };
        if (next.email === "Email already exists — try signing in") delete next.email;
        return next;
      });
    }
  };

  // After successful signup we navigate to /verify-email so the user
  // can enter the 6-digit code we email them. No link-based flow.

  const handleGoogle = async () => {
    setGoogleLoading(true);
    // Per product policy: Google can ONLY be used by users who already have
    // an account. We send them through OAuth, but if they're brand new the
    // server will block them and bounce back here with their details
    // pre-filled (handled by DeviceGate).
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/auth/google-return`,
    });
    if (result.error) {
      setGoogleLoading(false);
      toast({
        title: "Google didn't work",
        description: "Please try again, or fill the form below to create your account.",
        variant: "destructive",
      });
      return;
    }
    if (result.redirected) return;
    navigate("/auth/google-return");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsed = baseSchema.safeParse({ name, email, password });
    const fieldErrors: FormErrors = {};
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => {
        const key = issue.path[0] as keyof FormErrors;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      });
    }

    // Compose the full international number from country + local digits.
    const localDigits = phoneLocal.replace(/[^\d]/g, "");
    if (!localDigits) {
      fieldErrors.phone = "Enter your phone number";
    }
    const composed = localDigits ? `+${country.dial}${localDigits}` : "";
    const e164 = composed ? toE164(composed) : null;
    if (composed && !e164) {
      fieldErrors.phone = "That phone number doesn't look right";
    }

    if (password !== confirmPassword) {
      fieldErrors.confirmPassword = "Passwords don't match";
    }
    if (Object.keys(fieldErrors).length > 0 || !parsed.success || !e164) {
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);

    // Google-completion path: an existing Google session is live. Just
    // finish the profile (phone + password + name). No email OTP.
    if (googleVerified) {
      const { data, error: fnErr } = await supabase.functions.invoke("complete-google-registration", {
        body: {
          name: parsed.data.name,
          phone: e164,
          password: parsed.data.password,
        },
      });
      setSubmitting(false);
      if (fnErr || (data && (data as { error?: string }).error)) {
        const code = (data as { error?: string } | null)?.error;
        if (code === "phone_taken") {
          setErrors({ phone: "This phone number is already registered" });
          return;
        }
        if (code === "invalid_phone") {
          setErrors({ phone: "That phone number doesn't look right" });
          return;
        }
        if (code === "invalid_password") {
          setErrors({ password: "Password must be 8+ chars with a number and an uppercase letter" });
          return;
        }
        toast({
          title: "Couldn't finish your account",
          description: "Please try again in a moment.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Welcome to ChiChat" });
      navigate("/home", { replace: true });
      return;
    }

    // Standard email/password sign-up.
    const { data: signUpData, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: { full_name: parsed.data.name, phone: e164 },
        // No emailRedirectTo — Supabase sends a 6-digit OTP code, not a link.
      },
    });
    if (error) {
      setSubmitting(false);
      const msg = (error.message || "").toLowerCase();
      const duplicate =
        msg.includes("already registered") ||
        msg.includes("already exists") ||
        msg.includes("user already") ||
        (error as { status?: number }).status === 422;
      if (duplicate) {
        setErrors({ email: "Email already in use" });
        toast({
          title: "Email already in use",
          description: "Try signing in, or use a different email.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Sign up failed",
          description: error.message,
          variant: "destructive",
        });
      }
      return;
    }
    // Save phone to profile (handle_new_user trigger created the row)
    if (signUpData.user?.id && e164) {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ phone: e164 })
        .eq("id", signUpData.user.id);
      if (profileError && profileError.code === "23505") {
        setSubmitting(false);
        setErrors({ phone: "This phone number is already registered" });
        return;
      }
    }
    setSubmitting(false);
    // Route to the OTP entry screen.
    navigate("/verify-email", { state: { email: parsed.data.email }, replace: true });
  };

  // ---------- Registration form ----------
  return (
    <MobileFrame>
      <div className="h-full w-full overflow-y-auto flex justify-center bg-background">
        <div className="w-full max-w-sm sm:max-w-md flex flex-col px-5 sm:px-6 pt-6 pb-6 min-h-full">
          <button
            onClick={() => navigate("/")}
            aria-label="Back"
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary transition-colors -ml-1"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>

          <div className="mt-2">
            <BrandHero
              className="mb-3"
              message="Welcome to ChiChat — where conversations don't end and people never feel far away."
            />
            <h1 className="text-xl font-bold text-foreground leading-tight">
              Create your account
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Join Chichat and experience the possibilities.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-4 flex-1 flex flex-col">
            <div className="space-y-3">
              <div>
                <Label htmlFor="name" className="text-sm text-muted-foreground">
                  Full name
                </Label>
                <Input
                  id="name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                  maxLength={60}
                  className="mt-1 h-11 text-base bg-input border-border text-foreground placeholder:text-muted-foreground"
                  aria-invalid={!!errors.name}
                />
                {errors.name && (
                  <p className="text-sm text-destructive mt-1">{errors.name}</p>
                )}
              </div>

              <div>
                <Label htmlFor="email" className="text-sm text-muted-foreground">
                  Email address
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    if (googleVerified) return;
                    setEmail(e.target.value);
                    if (errors.email) {
                      setErrors((prev) => {
                        const next = { ...prev };
                        delete next.email;
                        return next;
                      });
                    }
                  }}
                  onBlur={googleVerified ? undefined : handleEmailBlur}
                  placeholder="you@example.com"
                  maxLength={255}
                  readOnly={googleVerified}
                  className={`mt-1 h-11 text-base bg-input border-border text-foreground placeholder:text-muted-foreground ${googleVerified ? "opacity-80" : ""}`}
                  aria-invalid={!!errors.email}
                />
                {googleVerified && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Verified by Google. You can't change this here.
                  </p>
                )}
                {!googleVerified && emailChecking && !errors.email && (
                  <p className="text-sm text-muted-foreground mt-1">Checking…</p>
                )}
                {errors.email && (
                  <p className="text-sm text-destructive mt-1">{errors.email}</p>
                )}
              </div>

              <div>
                <Label htmlFor="phone" className="text-sm text-muted-foreground">
                  Phone number
                </Label>
                <div className="mt-1 flex gap-2">
                  <CountryPicker
                    value={country.code}
                    onChange={(c) => setCountry(c)}
                  />
                  <Input
                    id="phone"
                    type="tel"
                    autoComplete="tel"
                    inputMode="tel"
                    value={phoneLocal}
                    onChange={(e) => setPhoneLocal(e.target.value.replace(/[^\d\s-]/g, ""))}
                    placeholder="801 234 5678"
                    maxLength={20}
                    className="flex-1 h-12 text-base bg-input border-border text-foreground placeholder:text-muted-foreground"
                    aria-invalid={!!errors.phone}
                  />
                </div>
                {errors.phone ? (
                  <p className="text-sm text-destructive mt-1">{errors.phone}</p>
                ) : (
                  <p className="text-sm text-muted-foreground mt-1">
                    Pick your country, then enter the rest of your number.
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="password" className="text-sm text-muted-foreground">
                  Password
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
                    className="h-11 text-base bg-input border-border text-foreground placeholder:text-muted-foreground pr-10"
                    aria-invalid={!!errors.password}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((s) => !s)}
                    aria-label={showPwd ? "Hide password" : "Show password"}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <PasswordStrengthBar password={password} />
                {errors.password && (
                  <p className="text-sm text-destructive mt-1">{errors.password}</p>
                )}
              </div>

              <div>
                <Label htmlFor="confirmPassword" className="text-sm text-muted-foreground">
                  Confirm password
                </Label>
                <Input
                  id="confirmPassword"
                  type={showPwd ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  maxLength={72}
                  className="mt-1 h-11 text-base bg-input border-border text-foreground placeholder:text-muted-foreground"
                  aria-invalid={!!errors.confirmPassword}
                />
                {errors.confirmPassword && (
                  <p className="text-sm text-destructive mt-1">{errors.confirmPassword}</p>
                )}
              </div>
            </div>

            <div className="mt-auto pt-4">
              <Button
                type="submit"
                disabled={submitting}
                className="w-full h-11 text-base bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg"
              >
                {submitting ? "Creating account…" : "Continue"}
              </Button>
              <div className="flex items-center gap-2 my-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground uppercase tracking-wider">or</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <Button
                type="button"
                onClick={handleGoogle}
                disabled={googleLoading}
                variant="outline"
                className="w-full h-11 text-base font-semibold rounded-lg gap-2"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.93l3.66-2.83z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"/>
                </svg>
                {googleLoading ? "Connecting…" : "Continue with Google"}
              </Button>
              <p className="text-sm text-muted-foreground text-center mt-3">
                Already have an account?{" "}
                <Link to="/login" className="text-accent font-semibold hover:underline">
                  Sign in
                </Link>
              </p>
              <p className="text-sm text-foreground text-center mt-2 font-semibold">
                By continuing, you agree to our{" "}
                <Link to="/terms" className="text-primary underline underline-offset-2">
                  Terms &amp; Privacy Policy
                </Link>
                .
              </p>
            </div>
          </form>
        </div>
      </div>
    </MobileFrame>
  );
}
