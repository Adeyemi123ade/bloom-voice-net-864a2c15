import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Loader2 } from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { toE164, formatDisplay } from "@/lib/phone";

function initials(name?: string | null) {
  if (!name) return "?";
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export default function Profile() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [about, setAbout] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = "Profile — Chichat";
  }, []);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name, avatar_url, phone")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        setDisplayName(data.display_name ?? "");
        setAvatarUrl(data.avatar_url);
        setPhone((data as { phone?: string | null }).phone ?? "");
      }
      // About is stored in user metadata for now (no schema change)
      setAbout((user.user_metadata as any)?.about ?? "");
    })();
  }, [user]);

  const onPick = () => fileRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 3 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Please pick under 3MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${user.id}/avatar.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      toast({ title: "Upload failed", description: upErr.message, variant: "destructive" });
      setUploading(false);
      return;
    }
    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    const url = `${pub.publicUrl}?v=${Date.now()}`;
    const { error: updErr } = await supabase
      .from("profiles")
      .upsert({ id: user.id, avatar_url: url }, { onConflict: "id" });
    if (updErr) {
      toast({ title: "Save failed", description: updErr.message, variant: "destructive" });
    } else {
      setAvatarUrl(url);
      toast({ title: "Profile photo updated" });
    }
    setUploading(false);
  };

  const save = async () => {
    if (!user) return;
    let normalizedPhone: string | null = null;
    if (phone.trim()) {
      normalizedPhone = toE164(phone.trim());
      if (!normalizedPhone) {
        toast({
          title: "Invalid phone number",
          description: "Use international format, e.g. +234 801 234 5678",
          variant: "destructive",
        });
        return;
      }
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .upsert(
        {
          id: user.id,
          display_name: displayName.trim() || null,
          phone: normalizedPhone,
        },
        { onConflict: "id" }
      );
    await supabase.auth.updateUser({ data: { about: about.trim() } });
    setSaving(false);
    if (error) {
      const msg = error.message.includes("profiles_phone_unique")
        ? "That phone number is already linked to another account."
        : error.message;
      toast({ title: "Save failed", description: msg, variant: "destructive" });
    } else {
      if (normalizedPhone) setPhone(normalizedPhone);
      toast({ title: "Profile saved" });
    }
  };


  return (
    <MobileFrame>
      <div className="h-full w-full flex flex-col bg-background overflow-y-auto">
        <div className="px-3 pt-4 pb-3 border-b border-border sticky top-0 bg-background z-10">
          <h1 className="text-sm font-semibold text-foreground">Profile</h1>
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
              aria-label="Change photo"
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
            <Label htmlFor="name" className="text-xs text-muted-foreground">Display name</Label>
            <Input
              id="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              className="h-9 text-xs bg-input border-border"
            />
          </div>

          <div className="w-full mt-3 space-y-1.5">
            <Label htmlFor="about" className="text-xs text-muted-foreground">About</Label>
            <Textarea
              id="about"
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              placeholder="Hey there! I'm using Chichat."
              className="min-h-[56px] text-xs bg-input border-border resize-none"
            />
          </div>

          <div className="w-full mt-3 space-y-1.5">
            <Label htmlFor="phone" className="text-xs text-muted-foreground">
              Phone number
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
                  aria-label="Clear phone"
                >
                  Clear
                </button>
              )}
            </div>
            <p className="text-2xs text-muted-foreground">
              Required so friends can find you when they sync their contacts.
              {phone && toE164(phone) && (
                <span className="block text-foreground/70 mt-0.5">
                  Saved as {formatDisplay(toE164(phone)!)}
                </span>
              )}
            </p>
          </div>

          <div className="w-full mt-3 space-y-1.5">
            <Label className="text-xs text-muted-foreground">Email</Label>
            <Input value={user?.email ?? ""} disabled className="h-9 text-xs bg-input border-border" />
          </div>

          <Button
            onClick={save}
            disabled={saving}
            className="w-full mt-5 h-10 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-xs"
          >
            {saving ? "Saving…" : "Save changes"}
          </Button>

        </div>
      </div>
    </MobileFrame>
  );
}
