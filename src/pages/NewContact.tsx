import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Camera, User } from "lucide-react";
import { addManualContact } from "@/lib/deviceContacts";
import { saveDeviceContact } from "@/lib/saveDeviceContact";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import MobileFrame from "@/components/MobileFrame";
import CountryPicker from "@/components/CountryPicker";
import { allCountries, findByDialPrefix, type CountryEntry } from "@/lib/countries";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { isTooManyDigits } from "@/lib/phone";
import { useBackNavigation } from "@/hooks/useBackNavigation";
import { useLanguage } from "@/lib/i18n/context";

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export default function NewContact() {
  const navigate = useNavigate();
  const { showBackArrow, goBack } = useBackNavigation("/contacts");
  const [params] = useSearchParams();
  const [name, setName] = useState("");
  const { t } = useLanguage();
  const initialPhone = params.get("phone") ?? "";
  const [country, setCountry] = useState<CountryEntry | null>(null);
  const [phoneLocal, setPhoneLocal] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [busy, setBusy] = useState<"phone" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Pre-fill avatar from the signed-in user's profile + sensible default country
  useEffect(() => {
    (async () => {
      // 1. From URL prefill
      if (initialPhone.startsWith("+")) {
        const hit = findByDialPrefix(initialPhone);
        if (hit) {
          setCountry(hit);
          setPhoneLocal(initialPhone.slice(1 + hit.dial.length).trim());
          return;
        }
      }
      // 2. From signed-in user's saved profile phone
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from("profiles")
            .select("avatar_url")
            .eq("id", user.id)
            .maybeSingle();
          const myAvatar = (data as { avatar_url?: string | null } | null)?.avatar_url;
          if (myAvatar) setAvatar(myAvatar);
          const { data: priv } = await supabase.rpc("get_my_profile_private");
          const privRow = Array.isArray(priv) ? priv[0] : priv;
          const myPhone = (privRow as { phone?: string | null } | null)?.phone;
          if (myPhone) {
            const hit = findByDialPrefix(myPhone);
            if (hit) {
              setCountry(hit);
              return;
            }
          }
        }
      } catch { /* ignore */ }
      // 3. User's own country unknown: default to Nigeria (+234).
      const ng = allCountries().find((c) => c.code === "NG");
      if (ng) setCountry(ng);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const e164 = useMemo(() => {
    if (!country) return null;
    const digits = phoneLocal.replace(/[^\d]/g, "");
    if (!digits) return null;
    try {
      const p = parsePhoneNumberFromString(digits, country.code as CountryCode);
      if (p?.isValid()) return p.number;
    } catch { /* ignore */ }
    return null;
  }, [country, phoneLocal]);

  const onPickImage = () => fileRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) {
      toast({ title: t("nc.imageTooLarge"), description: t("nc.under2"), variant: "destructive" });
      return;
    }
    try {
      const url = await fileToDataUrl(f);
      setAvatar(url);
    } catch {
      toast({ title: t("nc.cantLoadImage"), variant: "destructive" });
    } finally {
      e.target.value = "";
    }
  };

  const validate = (): { name: string; e164: string } | null => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast({ title: t("nc.nameRequired"), variant: "destructive" });
      return null;
    }
    if (!country) {
      toast({ title: t("nc.selectCountry"), variant: "destructive" });
      return null;
    }
    if (!e164) {
      toast({
        title: t("nc.invalidPhone"),
        description: t("nc.validFor", { country: country.name }),
        variant: "destructive",
      });
      return null;
    }
    return { name: trimmed, e164 };
  };

  const onSavePhoneBook = async () => {
    const v = validate();
    if (!v) return;
    setBusy("phone");
    addManualContact(v.name, v.e164, avatar);
    const onDevice = await saveDeviceContact(v.name, v.e164);
    setBusy(null);
    toast({
      title: t("save.saved"),
      description: onDevice
        ? t("nc.toPhoneBook")
        : t("save.toChichat"),
    });
    navigate(-1);
  };

  return (
    <MobileFrame>
      <div className="h-full bg-background text-foreground flex flex-col overflow-y-auto">
        {/* Header */}
        <header className="px-4 pt-4 pb-3 flex items-center gap-3">
          {showBackArrow && (
            <button
              onClick={goBack}
              aria-label={t("common.back")}
              className="w-9 h-9 rounded-xl bg-secondary/60 hover:bg-secondary flex items-center justify-center"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <h1 className="text-lg font-semibold">{t("ct.newContact")}</h1>
        </header>

        {/* Centered form column. Fields sit at the top and the save actions
            are anchored at the bottom, so tall screens don't leave a block
            of empty space under the buttons; short screens just scroll. */}
        <div className="flex-1 w-full mx-auto max-w-md px-5 flex flex-col">
          {/* Avatar uploader */}
          <div className="flex justify-center pt-2 pb-6">
            <button
              type="button"
              onClick={onPickImage}
              aria-label={t("nc.addPhoto")}
              className="relative w-24 h-24 rounded-2xl border-2 border-dashed border-primary/60 bg-primary/10 hover:bg-primary/15 transition-colors flex items-center justify-center overflow-hidden"
            >
              {avatar ? (
                <img src={avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <User className="w-10 h-10 text-blue-400" strokeWidth={2} />
              )}
              <span className="absolute bottom-1 right-1 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow">
                <Camera className="w-3.5 h-3.5" />
              </span>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onFile}
              />
            </button>
          </div>

          {/* Form */}
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-semibold tracking-[0.15em] text-muted-foreground">
                {t("nc.fullName")}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("nc.fullNamePh")}
                className="w-full h-12 px-4 rounded-xl bg-secondary/40 border border-border/40 text-sm placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary/50"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold tracking-[0.15em] text-muted-foreground">
                {t("nc.phoneNumber")}
              </label>
              <div className="flex gap-2">
                <CountryPicker value={country?.code ?? null} onChange={setCountry} />
                <input
                  type="tel"
                  inputMode="tel"
                  value={phoneLocal}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/[^\d\s-]/g, "");
                    const digitsOnly = cleaned.replace(/\D/g, "");
                    // See Register.tsx's phone input for why the DOM value
                    // must be reset explicitly, not just the state skipped.
                    if (country && isTooManyDigits(digitsOnly, country.code)) {
                      e.target.value = phoneLocal;
                      return;
                    }
                    setPhoneLocal(cleaned);
                  }}
                  placeholder={t("nc.phonePh")}
                  className="flex-1 min-w-0 h-12 px-4 rounded-xl bg-secondary/40 border border-border/40 text-sm placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary/50"
                />
              </div>
            </div>
          </div>

          <div className="mt-auto pt-8 pb-[calc(env(safe-area-inset-bottom)+20px)] space-y-3">
              <p className="text-xs font-semibold tracking-[0.15em] text-muted-foreground">
                {t("nc.saveTo")}
              </p>

              <button
                onClick={onSavePhoneBook}
                disabled={busy !== null}
                className="w-full h-12 rounded-xl border border-primary/60 bg-primary/10 hover:bg-primary/15 text-primary font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
              >
                <span aria-hidden>📱</span>
                {busy === "phone" ? t("save.saving") : t("nc.savePhoneBook")}
              </button>
          </div>
        </div>
      </div>
    </MobileFrame>
  );
}
