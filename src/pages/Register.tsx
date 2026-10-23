import { isBannedError, signupAllowed } from "@/lib/accountStatus";
import { SUPPORT_EMAIL } from "@/lib/support";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { z } from "zod";
import { Eye, EyeOff } from "lucide-react";
import AuthScreen, { AuthDivider } from "@/components/auth/AuthScreen";
import { authStyles } from "@/components/auth/authStyles";
import BrandHero from "@/components/BrandHero";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

import { toE164, isTooManyDigits } from "@/lib/phone";
import CountryPicker from "@/components/CountryPicker";
import { allCountries, type CountryEntry } from "@/lib/countries";
import PasswordStrengthBar from "@/components/PasswordStrengthBar";
import PasswordMatchHint from "@/components/PasswordMatchHint";
import { firstUnmetPasswordRule } from "@/lib/passwordStrength";
import { checkEmailExists } from "@/lib/checkEmail";
import { isRecoveryPending } from "@/lib/recoveryPending";
import { markVerifyEmailPending, getVerifyEmailPending } from "@/lib/verifyEmailPending";
import { startGoogleAuth } from "@/lib/googleAuth";
import { googleErrorText } from "@/lib/googleErrorText";
import { useLanguage } from "@/lib/i18n/context";

const baseSchema = z.object({
  name: z
    .string()
    .trim()
    // Messages are keys of translated text (src/lib/i18n), shown with tx().
    .min(2, { message: "reg.nameMin" })
    .max(60, { message: "reg.nameMax" }),
  email: z
    .string()
    .trim()
    .email({ message: "err.validEmail" })
    .max(255, { message: "reg.emailMax" }),
  // Same rules the live hint under the field shows (src/lib/passwordStrength).
  password: z
    .string()
    .max(72, { message: "reg.passwordMax" })
    .superRefine((p, ctx) => {
        const unmet = firstUnmetPasswordRule(p);
        if (unmet) ctx.addIssue({ code: "custom", message: unmet.messageKey });
      }),
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
  const { t, tx } = useLanguage();
  const { user, loading: authLoading } = useAuth();
  useEffect(() => {
    // Don't redirect away when the user is mid-Google-completion: they're
    // signed in but their profile isn't finished yet.
    if (authLoading || googleVerified) return;
    // No live session — but a signup can still be pending confirmation even
    // without one (e.g. the user hit Back before a session was established,
    // or refreshed and lost the in-memory router state). Without this check
    // they'd land on a blank Register form with no way back to the OTP
    // screen, while the code they were emailed has nowhere to be entered.
    if (!user) {
      const pendingEmail = getVerifyEmailPending();
      if (pendingEmail) {
        navigate("/verify-email", { replace: true, state: { email: pendingEmail } });
      }
      return;
    }
    // A session can exist for an account that hasn't confirmed its email OTP
    // yet (e.g. the user hit Back after signUp). Never treat that as "already
    // logged in" — send them to finish verification instead of into the app.
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
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);
  const [agreeError, setAgreeError] = useState(false);

  // On blur: if the email is well-formed, ask the backend whether it's already
  // taken. We only set the inline error here — the form's own validation runs
  // on submit.
  const handleEmailBlur = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
      setErrors((prev) => ({ ...prev, email: "err.validEmail" }));
      return;
    }
    setEmailChecking(true);
    const exists = await checkEmailExists(trimmed);
    setEmailChecking(false);
    if (exists === true) {
      setErrors((prev) => ({ ...prev, email: "reg.emailInUse" }));
    } else if (exists === false) {
      setErrors((prev) => {
        const next = { ...prev };
        if (next.email === "reg.emailInUse") delete next.email;
        return next;
      });
    }
  };

  // After successful signup we navigate to /verify-email so the user
  // can enter the 6-digit code we email them. No link-based flow.

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
        title: t("reg.googleFailTitle"),
        description: googleErrorText(error, "reg.googleFailBody").description,
        variant: "destructive",
      });
    }
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
      fieldErrors.phone = "reg.enterPhone";
    }
    const composed = localDigits ? `+${country.dial}${localDigits}` : "";
    const e164 = composed ? toE164(composed) : null;
    if (composed && !e164) {
      fieldErrors.phone = "reg.phoneWrong";
    }

    if (password !== confirmPassword) {
      fieldErrors.confirmPassword = "reg.passwordsDontMatch";
    }
    if (Object.keys(fieldErrors).length > 0 || !parsed.success || !e164) {
      setErrors(fieldErrors);
      return;
    }
    if (!agreedToPolicy) {
      setAgreeError(true);
      toast({
        title: t("reg.agreeTitle"),
        description: t("reg.agreeBody"),
        variant: "destructive",
      });
      return;
    }
    setErrors({});
    setAgreeError(false);
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
          setErrors({ phone: "reg.phoneTaken" });
          return;
        }
        if (code === "invalid_phone") {
          setErrors({ phone: "reg.phoneWrong" });
          return;
        }
        if (code === "invalid_password") {
          setErrors({ password: "reg.invalidPassword" });
          return;
        }
        toast({
          title: t("reg.finishFailTitle"),
          description: t("auth.tryAgainMoment"),
          variant: "destructive",
        });
        return;
      }
      toast({ title: t("reg.welcome") });
      navigate("/home", { replace: true });
      return;
    }

    const { data: availability, error: availabilityError } = await supabase.functions.invoke("check-registration-availability", {
      body: { email: parsed.data.email, phone: e164 },
    });
    const availErrCode = (availability as { error?: string } | null)?.error;
    // If the check was limited or unavailable, sign-up still goes ahead: the
    // database refuses a taken email or phone, and that is handled below.
    if (availErrCode === "invalid_details") {
      // The backend's stricter E.164 check rejected the number even though it
      // passed client-side parsing — surface this as a phone problem, not a
      // generic "couldn't register" failure.
      setSubmitting(false);
      setErrors({ phone: "reg.phoneWrongCountry" });
      toast({
        title: t("reg.checkPhoneTitle"),
        description: t("reg.checkPhoneBody"),
        variant: "destructive",
      });
      return;
    }
    if (availabilityError || availErrCode) {
      const emailExists = await checkEmailExists(parsed.data.email);
      if (emailExists === true) {
        setSubmitting(false);
        setErrors({ email: "reg.emailRegisteredInline" });
        toast({
          title: t("reg.emailRegisteredTitle"),
          description: t("reg.emailRegisteredBody", { email: parsed.data.email }),
          variant: "destructive",
        });
        return;
      }
    }
    const availabilityResult = availabilityError ? null : availability as { email_exists?: boolean; phone_exists?: boolean } | null;
    if (availabilityResult?.email_exists || availabilityResult?.phone_exists) {
      setSubmitting(false);
      const nextErrors: FormErrors = {};
      if (availabilityResult.email_exists) nextErrors.email = "reg.emailRegisteredInline";
      if (availabilityResult.phone_exists) nextErrors.phone = t("reg.phoneRegisteredInline", { phone: e164 });
      setErrors(nextErrors);
      toast({
        title: availabilityResult.email_exists && availabilityResult.phone_exists
          ? t("reg.bothRegisteredTitle")
          : availabilityResult.email_exists
            ? t("reg.emailRegisteredTitle")
            : t("reg.phoneRegisteredTitle"),
        description: t("reg.detailInUseBody"),
        variant: "destructive",
      });
      return;
    }

    // Details that belong to a suspended account can't be used again.
    if (!(await signupAllowed(parsed.data.email, e164))) {
      setSubmitting(false);
      toast({
        title: t("reg.notAllowedTitle"),
        description: t("reg.notAllowedBody", { email: SUPPORT_EMAIL }),
        variant: "destructive",
      });
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
        setErrors({ email: "reg.emailRegisteredInline" });
        toast({
          title: t("reg.emailRegisteredTitle"),
          description: t("reg.emailRegisteredBody", { email: parsed.data.email }),
          variant: "destructive",
        });
      } else {
        console.error("[register] sign-up failed", error);
        toast({
          title: t("reg.createFailTitle"),
          description: t("auth.tryAgainMoment"),
          variant: "destructive",
        });
      }
      return;
    }
    // Save phone to profile (handle_new_user trigger created the row without phone)
    if (signUpData.user?.id && e164) {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ phone: e164 })
        .eq("id", signUpData.user.id);
      if (profileError) {
        setSubmitting(false);
        if (profileError.code === "23505") {
          setErrors({ phone: t("reg.phoneTakenInline", { phone: e164 }) });
          toast({
            title: t("reg.phoneRegisteredTitle"),
            description: t("reg.phoneTakenBody", { phone: e164 }),
            variant: "destructive",
          });
        } else if (isBannedError(profileError)) {
          toast({
            title: t("reg.notAllowedTitle"),
            description: t("reg.notAllowedBody", { email: SUPPORT_EMAIL }),
            variant: "destructive",
          });
        } else {
          console.error("[register] phone save failed", profileError);
          toast({
            title: t("reg.phoneSaveFailTitle"),
            description: t("auth.tryAgain"),
            variant: "destructive",
          });
        }
        return;
      }
    }
    setSubmitting(false);
    // Persist the pending email so the OTP screen survives a back-navigation
    // or refresh — see verifyEmailPending.ts for why router state alone isn't enough.
    markVerifyEmailPending(parsed.data.email);
    // Route to the OTP entry screen.
    navigate("/verify-email", { state: { email: parsed.data.email }, replace: true });
  };

  // ---------- Registration form ----------
  return (
    <AuthScreen onBack={() => navigate("/")}>

          <div className="mt-1">
            <BrandHero
              className="mb-5"
              message={t("reg.joinMessage")}
            />
            <h1 className={authStyles.title}>
              {googleVerified ? t("reg.finishTitle") : t("reg.title")}
            </h1>
            {googleVerified && (
              <p className="text-sm text-muted-foreground mt-1">
                {t("reg.googleNote")}
              </p>
            )}
          </div>


          <form onSubmit={handleSubmit} className="mt-4 flex flex-col">
            <div className={authStyles.fieldGap}>
              <div>
                <Label htmlFor="name" className={authStyles.label}>
                  {t("reg.fullName")}
                </Label>
                <Input
                  id="name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                  maxLength={60}
                  className="mt-1.5"
                  aria-invalid={!!errors.name}
                />
                {errors.name && (
                  <p className="text-sm text-destructive mt-1">{tx(errors.name)}</p>
                )}
              </div>

              <div>
                <Label htmlFor="email" className={authStyles.label}>
                  {t("reg.email")}
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
                  className={`mt-1.5 ${googleVerified ? "opacity-80" : ""}`}
                  aria-invalid={!!errors.email}
                />
                {googleVerified && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {t("reg.googleEmailNote")}
                  </p>
                )}
                {!googleVerified && emailChecking && !errors.email && (
                  <p className="text-sm text-muted-foreground mt-1">{t("reg.checking")}</p>
                )}
                {errors.email && (
                  <p className="text-sm text-destructive mt-1">{tx(errors.email)}</p>
                )}
              </div>

              <div>
                <Label htmlFor="phone" className={authStyles.label}>
                  {t("reg.phone")}
                </Label>
                <div className="mt-1.5 flex gap-2">
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
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/[^\d\s-]/g, "");
                      const digitsOnly = cleaned.replace(/\D/g, "");
                      // Stop accepting digits once the number is already too
                      // long for the selected country — e.g. NG numbers are
                      // 10 digits after +234, so an 11th digit is rejected
                      // instead of silently accepted and only caught on submit.
                      // The browser has already written the keystroke into the
                      // input's DOM value by the time this fires; skipping
                      // setState alone doesn't undo that (React only corrects
                      // the DOM on a state change, and rejecting without
                      // updating state means no re-render happens at all) — so
                      // the DOM value must be reset back explicitly here.
                      if (isTooManyDigits(digitsOnly, country.code)) {
                        e.target.value = phoneLocal;
                        return;
                      }
                      setPhoneLocal(cleaned);
                    }}
                    placeholder="801 234 5678"
                    maxLength={20}
                    className="flex-1"
                    aria-invalid={!!errors.phone}
                  />
                </div>
                {errors.phone && (
                  <p className="text-sm text-destructive mt-1">{tx(errors.phone)}</p>
                )}

              </div>

              <div>
                <Label htmlFor="password" className={authStyles.label}>
                  {t("auth.password")}
                </Label>
                <div className="relative mt-1.5">
                  <Input
                    id="password"
                    type={showPwd ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t("reg.passwordPlaceholder")}
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
                <PasswordStrengthBar password={password} />
                {errors.password && (
                  <p className="text-sm text-destructive mt-1">{tx(errors.password)}</p>
                )}
              </div>

              <div>
                <Label htmlFor="confirmPassword" className={authStyles.label}>
                  {t("reg.confirm")}
                </Label>
                <Input
                  id="confirmPassword"
                  type={showPwd ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t("reg.confirmPlaceholder")}
                  maxLength={72}
                  className="mt-1.5"
                  aria-invalid={!!errors.confirmPassword}
                />
                {errors.confirmPassword ? (
                  <p className="text-sm text-destructive mt-1">{tx(errors.confirmPassword)}</p>
                ) : (
                  <PasswordMatchHint password={password} confirm={confirmPassword} />
                )}
              </div>
            </div>

            <div className="pt-5">
              <Button
                type="submit"
                disabled={submitting}
                className={authStyles.primaryButton}
              >
                {submitting ? (googleVerified ? t("reg.finishing") : t("reg.creating")) : (googleVerified ? t("reg.finish") : t("reg.continue"))}
              </Button>
              {!googleVerified && (
                <>
                  <AuthDivider />
                  <Button
                    type="button"
                    onClick={handleGoogle}
                    disabled={googleLoading}
                    variant="outline"
                    className={authStyles.secondaryButton}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.93l3.66-2.83z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"/>
                    </svg>
                    {googleLoading ? t("auth.connecting") : t("auth.google")}
                  </Button>
                </>
              )}
              <p className={`${authStyles.footnote} mt-4`}>
                {t("splash.haveAccount")}{" "}
                <Link to="/login" className={authStyles.link}>
                  {t("splash.signIn")}
                </Link>
              </p>
              <div className={`flex items-center gap-2.5 mt-4 px-1 ${agreeError ? "text-destructive" : ""}`}>
                <Checkbox
                  id="agree-policy"
                  checked={agreedToPolicy}
                  onCheckedChange={(v) => {
                    setAgreedToPolicy(v === true);
                    if (v === true) setAgreeError(false);
                  }}
                  aria-invalid={agreeError}
                  className={agreeError ? "border-destructive" : ""}
                />
                <Label
                  htmlFor="agree-policy"
                  className={`text-[13px] font-normal leading-snug cursor-pointer ${agreeError ? "text-destructive" : "text-foreground"}`}
                >
                  {t("reg.agreePrefix")}{" "}
                  <Link to="/terms" className="text-primary underline underline-offset-2">
                    {t("splash.terms")}
                  </Link>{" "}
                  {t("reg.agreeAnd")}{" "}
                  <Link to="/privacy" className="text-primary underline underline-offset-2">
                    {t("splash.privacy")}
                  </Link>
                  .
                </Label>
              </div>
            </div>
          </form>
    </AuthScreen>
  );
}
