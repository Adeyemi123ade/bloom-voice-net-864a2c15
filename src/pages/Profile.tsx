import { isBannedError } from "@/lib/accountStatus";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Camera, Loader2 } from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { toE164, formatDisplay, getMyDefaultCountry } from "@/lib/phone";
import { useBackNavigation } from "@/hooks/useBackNavigation";
import { useLanguage } from "@/lib/i18n/context";

function initials(name?: string | null) {
  if (!name) return "?";
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export default function Profile() {
  const navigate = useNavigate();
  const { showBackArrow, goBack } = useBackNavigation("/settings");
  const { user, loading } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [about, setAbout] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { t } = useLanguage();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = `${t("pr.title")} — Chichat`;
  }, [t]);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        setDisplayName(data.display_name ?? "");
        setAvatarUrl(data.avatar_url);
      }
      const { data: priv } = await supabase.rpc("get_my_profile_private");
      const row = Array.isArray(priv) ? priv[0] : priv;
      setPhone((row as { phone?: string | null } | null)?.phone ?? "");
      // About is stored in user metadata for now (no schema change)
      setAbout((user.user_metadata as { about?: string } | undefined)?.about ?? "");
    })();
  }, [user]);

  const onPick = () => fileRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 3 * 1024 * 1024) {
      toast({ title: t("nc.imageTooLarge"), description: t("pr.imageTooLarge3"), variant: "destructive" });
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${user.id}/avatar.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      toast({ title: t("chat.uploadFailed"), description: upErr.message, variant: "destructive" });
      setUploading(false);
      return;
    }
    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    const url = `${pub.publicUrl}?v=${Date.now()}`;
    const { error: updErr } = await supabase
      .from("profiles")
      .upsert({ id: user.id, avatar_url: url }, { onConflict: "id" });
    if (updErr) {
      toast({ title: t("pr.saveFailed"), description: updErr.message, variant: "destructive" });
    } else {
      setAvatarUrl(url);
      toast({ title: t("pr.photoUpdated") });
    }
    setUploading(false);
  };

  const save = async () => {
    if (!user) return;
    if (!phone.trim()) {
      // The number can be changed but not removed: friends find you by it.
      toast({ title: t("pr.saveFailed"), description: t("pr.phoneKept"), variant: "destructive" });
      return;
    }
    // A local number (no +) is read with this person's own country first.
    const normalizedPhone = toE164(phone.trim(), await getMyDefaultCountry());
    if (!normalizedPhone) {
      toast({
        title: t("nc.invalidPhone"),
        description: t("pr.useIntl"),
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("update_my_profile", {
      _display_name: displayName.trim(),
      _phone: normalizedPhone,
    });
    await supabase.auth.updateUser({ data: { about: about.trim() } });
    setSaving(false);
    if (error) {
      const msg = error.message.includes("phone_required")
        ? t("pr.phoneKept")
        : error.message.includes("phone_taken") || error.message.includes("profiles_phone_unique")
          ? t("pr.phoneLinked")
          : isBannedError(error)
            ? t("pr.phoneNotAllowed")
            : t("pr.cantSave");
      toast({ title: t("pr.saveFailed"), description: msg, variant: "destructive" });
    } else {
      setPhone(normalizedPhone);
      toast({ title: t("pr.saved") });
    }
  };


  return (
    <MobileFrame>
      <div className="h-full w-full flex flex-col bg-background overflow-y-auto">
        <div className="px-2 pt-4 pb-3 flex items-center gap-2 border-b border-border sticky top-0 bg-background z-10">
          {showBackArrow && (
            <button
              onClick={goBack}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary"
              aria-label={t("common.back")}
            >
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
          )}
          <h1 className={`text-sm font-semibold text-foreground ${showBackArrow ? "" : "pl-2"}`}>{t("pr.title")}</h1>
        </div>

        <div className="flex-1 px-6 py-5 flex flex-col items-center">
          <p className="text-xs text-muted-foreground mb-3">
            Hello {displayName || "friend"} 👋
          </p>
          <div className="relative">
            <Avatar className="w-20 h-20">
              <AvatarImage src={avatarUrl ?? undefined} />
              <AvatarFallback className="bg-primary/20 text-foreground text-lg font-semibold">
                {initials(displayName)}
              </AvatarFallback>
            </Avatar>
            <button
              onClick={onPick}
              disabled={uploading}
              aria-label={t("pr.changePhoto")}
              className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-primary hover:bg-primary/90 flex items-center justify-center border-2 border-background"
            >
              {uploading ? (
                <Loader2 className="w-3.5 h-3.5 text-primary-foreground animate-spin" />
              ) : (
                <Camera className="w-3.5 h-3.5 text-primary-foreground" />
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onFile}
            />
          </div>

          <div className="w-full mt-5 space-y-1.5">
            <Label htmlFor="name" className="text-xs text-muted-foreground">{t("pr.displayName")}</Label>
            <Input
              id="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t("pr.namePh")}
              className="h-9 text-xs bg-input border-border"
            />
          </div>

          <div className="w-full mt-3 space-y-1.5">
            <Label htmlFor="email" className="text-xs text-muted-foreground">{t("pr.email")}</Label>
            <Input
              id="email"
              type="email"
              value={user?.email ?? ""}
              readOnly
              disabled
              className="h-9 text-xs bg-muted/40 border-border text-muted-foreground cursor-not-allowed"
            />
            <p className="text-2xs text-muted-foreground">
              {t("pr.emailFixed")}
            </p>
          </div>

          <div className="w-full mt-3 space-y-1.5">
            <Label htmlFor="about" className="text-xs text-muted-foreground">{t("pr.about")}</Label>
            <Textarea
              id="about"
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              placeholder={t("pr.aboutPh")}
              className="min-h-[56px] text-xs bg-input border-border resize-none"
            />
          </div>

          <div className="w-full mt-3 space-y-1.5">
            <Label htmlFor="phone" className="text-xs text-muted-foreground">
              {t("pr.phone")}
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => {
                  // Allow digits, +, spaces, dashes, parens while typing
                  const cleaned = e.target.value.replace(/[^\d+\s\-()]/g, "");
                  setPhone(cleaned);
                }}
                placeholder="+234 801 234 5678"
                className="h-9 text-xs bg-input border-border flex-1"
              />
              {phone && (
                <button
                  type="button"
                  onClick={() => setPhone("")}
                  className="text-2xs text-muted-foreground hover:text-foreground px-2 h-9"
                  aria-label={t("pr.clearPhone")}
                >
                  {t("pr.clear")}
                </button>
              )}
            </div>
            <p className="text-2xs text-muted-foreground">
              {t("pr.required")}
            </p>
          </div>

          <Button
            onClick={save}
            disabled={saving}
            className="w-full mt-5 h-10 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-xs"
          >
            {saving ? t("save.saving") : t("pr.saveChanges")}
          </Button>

        </div>
      </div>
    </MobileFrame>
  );
}
