import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Camera, User } from "lucide-react";
import {
  addManualContact,
  getDefaultContactAvatar,
} from "@/lib/deviceContacts";
import { saveDeviceContact } from "@/lib/saveDeviceContact";
import { toE164 } from "@/lib/phone";
import { toast } from "@/hooks/use-toast";
import { syncGoogleContacts, startGoogleContactsConnect } from "@/lib/googleContacts";
import { supabase } from "@/integrations/supabase/client";
import MobileFrame from "@/components/MobileFrame";

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
  const [params] = useSearchParams();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState(params.get("phone") ?? "+971 ");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [busy, setBusy] = useState<"google" | "phone" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Pre-fill default avatar set in Settings
  useEffect(() => {
    setAvatar(getDefaultContactAvatar());
  }, []);

  const onPickImage = () => fileRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Pick under 2MB.", variant: "destructive" });
      return;
    }
    try {
      const url = await fileToDataUrl(f);
      setAvatar(url);
    } catch {
      toast({ title: "Could not load image", variant: "destructive" });
    } finally {
      e.target.value = "";
    }
  };

  const validate = (): { name: string; e164: string } | null => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast({ title: "Name required", variant: "destructive" });
      return null;
    }
    const e164 = toE164(phone);
    if (!e164) {
      toast({
        title: "Invalid phone number",
        description: "Use international format like +971 50 123 4567.",
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
      title: "Contact saved",
      description: onDevice
        ? "Added to your device phone book."
        : "Saved to your ChiChat contacts.",
    });
    navigate(-1);
  };

  const onSaveGoogle = async () => {
    const v = validate();
    if (!v) return;
    setBusy("google");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: "Sign in required", variant: "destructive" });
        setBusy(null);
        return;
      }
      const { data: tok } = await supabase
        .from("google_oauth_tokens")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!tok) {
        toast({
          title: "Connect Google first",
          description: "Redirecting to Google to authorise contacts.",
        });
        await startGoogleContactsConnect();
        return;
      }
      const { error } = await supabase.functions.invoke("google-contacts-create", {
        body: { name: v.name, phone: v.e164 },
      });
      if (error) throw error;
      addManualContact(v.name, v.e164, avatar);
      await syncGoogleContacts().catch(() => null);
      toast({ title: "Saved to Google Contacts" });
      navigate(-1);
    } catch (e) {
      toast({
        title: "Couldn't save to Google",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <MobileFrame>
      <div className="min-h-full bg-background text-foreground flex flex-col">
        {/* Header */}
        <header className="px-4 pt-4 pb-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="w-9 h-9 rounded-xl bg-secondary/60 hover:bg-secondary flex items-center justify-center"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-lg font-semibold">New Contact</h1>
        </header>

        {/* Centered form column */}
        <div className="flex-1 w-full mx-auto max-w-md px-5">
          {/* Avatar uploader */}
          <div className="flex justify-center pt-2 pb-6">
            <button
              type="button"
              onClick={onPickImage}
              aria-label="Add photo"
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
              <label className="text-[11px] font-semibold tracking-[0.15em] text-muted-foreground">
                FULL NAME
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter full name"
                className="w-full h-12 px-4 rounded-xl bg-secondary/40 border border-border/40 text-sm placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary/50"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-semibold tracking-[0.15em] text-muted-foreground">
                PHONE NUMBER
              </label>
              <input
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+971 ..."
                className="w-full h-12 px-4 rounded-xl bg-secondary/40 border border-border/40 text-sm placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary/50"
              />
            </div>

            <div className="space-y-3 pt-2">
              <p className="text-[11px] font-semibold tracking-[0.15em] text-muted-foreground">
                SAVE TO
              </p>

              <button
                onClick={onSaveGoogle}
                disabled={busy !== null}
                className="w-full h-12 rounded-xl border border-blue-500/60 bg-blue-500/10 hover:bg-blue-500/15 text-blue-400 font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
              >
                <span className="font-bold text-base">G</span>
                {busy === "google" ? "Saving…" : "Save to Google Contacts"}
              </button>

              <button
                onClick={onSavePhoneBook}
                disabled={busy !== null}
                className="w-full h-12 rounded-xl border border-primary/60 bg-primary/10 hover:bg-primary/15 text-primary font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
              >
                <span aria-hidden>📱</span>
                {busy === "phone" ? "Saving…" : "Save to Phone Book"}
              </button>

              <div className="rounded-xl bg-secondary/30 border border-border/30 px-3 py-3 flex gap-2">
                <span aria-hidden className="text-blue-400 mt-0.5">ℹ️</span>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Contacts are saved directly to your phone — not stored inside the app.
                </p>
              </div>
            </div>
          </div>

          <div className="h-6" />
        </div>
      </div>
    </MobileFrame>
  );
}
