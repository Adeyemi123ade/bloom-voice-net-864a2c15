import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthScreen from "@/components/auth/AuthScreen";
import { authStyles } from "@/components/auth/authStyles";
import BrandHero from "@/components/BrandHero";
import CountryPicker from "@/components/CountryPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { isBannedError } from "@/lib/accountStatus";
import { allCountries, type CountryEntry } from "@/lib/countries";
import { unregisterCallPush } from "@/lib/fcmRegistration";
import { useLanguage } from "@/lib/i18n/context";
import { guessMyCountry, isTooManyDigits, toE164 } from "@/lib/phone";
import { checkMyPhone, rememberPhoneOnDevice } from "@/lib/phoneRequired";

function startCountry(): CountryEntry {
  const list = allCountries();
  const code = guessMyCountry();
  return list.find((c) => c.code === code) ?? list.find((c) => c.code === "NG") ?? list[0];
}

/**
 * For an account that has no phone number yet. Friends find each other on
 * ChiChat by phone number, so the app can't be used until one is saved.
 * The only other way out is signing out.
 */
export default function AddPhone() {
  const navigate = useNavigate();
  const { t, tx } = useLanguage();
  const { user, loading } = useAuth();
  const [country, setCountry] = useState<CountryEntry>(startCountry);
  const [phoneLocal, setPhoneLocal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    document.title = "Add your phone number — Chichat";
  }, []);

  // Signed out: sign in first. Already has a number: straight to the chats.
  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    let cancelled = false;
    void checkMyPhone(user.id).then((r) => {
      if (!cancelled && r === "has-phone") navigate("/home", { replace: true });
    });
    return () => {
      cancelled = true;
    };
  }, [loading, user, navigate]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || saving) return;
    const digits = phoneLocal.replace(/\D/g, "");
    if (!digits) {
      setError("reg.enterPhone");
      return;
    }
    const e164 = toE164(`+${country.dial}${digits}`);
    if (!e164) {
      setError("reg.phoneWrong");
      return;
    }
    setError(null);
    setSaving(true);
    const { error: err } = await supabase.rpc("update_my_profile", {
      _display_name: "",
      _phone: e164,
    });
    setSaving(false);
    if (err) {
      if (err.code === "23505" || /phone_taken|profiles_phone_unique/.test(err.message)) {
        setError("pr.phoneLinked");
      } else if (isBannedError(err)) {
        setError("pr.phoneNotAllowed");
      } else if (/invalid_phone/.test(err.message)) {
        setError("reg.phoneWrong");
      } else {
        console.warn("[add-phone] save failed", err);
        toast({ title: t("ph.saveFail"), variant: "destructive" });
      }
      return;
    }
    rememberPhoneOnDevice(user.id);
    toast({ title: t("ph.saved") });
    navigate("/home", { replace: true });
  };

  const signOut = async () => {
    setLeaving(true);
    try {
      await unregisterCallPush();
    } catch {
      /* no push registration on this device */
    }
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      /* already signed out */
    }
    window.location.replace("/login");
  };

  return (
    <AuthScreen onBack={() => void signOut()}>
      <BrandHero />
      <form onSubmit={save} className="mt-6 space-y-5" noValidate>
        <div>
          <h1 className={authStyles.title}>{t("ph.title")}</h1>
          <p className={authStyles.subtitle}>{t("ph.body")}</p>
        </div>

        <div>
          <Label htmlFor="add-phone" className={authStyles.label}>
            {t("reg.phone")}
          </Label>
          <div className="mt-1.5 flex gap-2">
            <CountryPicker value={country.code} onChange={(c) => setCountry(c)} />
            <Input
              id="add-phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              value={phoneLocal}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/[^\d\s-]/g, "");
                // Same limit as registration: no more digits than a mobile
                // number in the chosen country has (see Register.tsx).
                if (isTooManyDigits(cleaned.replace(/\D/g, ""), country.code)) {
                  e.target.value = phoneLocal;
                  return;
                }
                setPhoneLocal(cleaned);
              }}
              placeholder="801 234 5678"
              maxLength={20}
              className="flex-1"
              aria-invalid={!!error}
            />
          </div>
          {error && <p className="text-sm text-destructive mt-1">{tx(error)}</p>}
        </div>

        <Button type="submit" className={authStyles.primaryButton} disabled={saving || leaving}>
          {saving ? t("ph.saving") : t("ph.continue")}
        </Button>
        <Button
          type="button"
          variant="outline"
          className={authStyles.secondaryButton}
          onClick={() => void signOut()}
          disabled={saving || leaving}
        >
          {t("settings.signOut")}
        </Button>
      </form>
    </AuthScreen>
  );
}
