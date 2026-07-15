import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Contact2,
  Globe,
  Loader2,
  Music,
  Palette,
  Play,
  RefreshCw,
  Square,
  Type,
  Upload,
  X,
} from "lucide-react";
import { useTheme } from "next-themes";
import MobileFrame from "@/components/MobileFrame";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Monitor, Moon, Sun } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  startGoogleContactsConnect,
  completeGoogleContactsConnect,
  syncGoogleContacts,
  GoogleContactsReconnectRequired,
} from "@/lib/googleContacts";
import {
  isVoiceTranscribeEnabled,
  setVoiceTranscribeEnabled,
} from "@/lib/transcriptionPrefs";
import { getPreferredLanguage, setPreferredLanguage } from "@/lib/languagePrefs";
import { LANGUAGES, languageLabel } from "@/lib/languages";
import {
  RINGTONES,
  RingtoneId,
  getSelectedRingtone,
  setSelectedRingtone,
  playRingtone,
  getCustomRingtone,
  setCustomRingtone,
  CustomRingtone,
} from "@/lib/ringtones";

const MAX_CUSTOM_BYTES = 3 * 1024 * 1024; // 3MB cap (localStorage friendly)

export default function PhoneSettings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const [themeOpen, setThemeOpen] = useState(false);
  const [toneOpen, setToneOpen] = useState(false);
  const [selected, setSelected] = useState<RingtoneId>(getSelectedRingtone());
  const [custom, setCustom] = useState<CustomRingtone | null>(getCustomRingtone());
  const [previewing, setPreviewing] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [voiceTranscribe, setVoiceTranscribe] = useState(() => isVoiceTranscribeEnabled());
  const [preferredLang, setPreferredLang] = useState(() => getPreferredLanguage());
  const [langOpen, setLangOpen] = useState(false);

  // Google contacts integration (moved here from Settings).
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [googleOpen, setGoogleOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [params, setParams] = useSearchParams();

  useEffect(() => {
    document.title = "Phone settings — Chichat";
  }, []);

  useEffect(() => {
    if (!toneOpen) stopPreview();
  }, [toneOpen]);

  useEffect(() => {
    return () => stopPreview();
  }, []);

  // Load Google connection status
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("google_oauth_tokens")
        .select("google_email")
        .maybeSingle();
      setGoogleEmail(data?.google_email ?? null);
    })();
  }, [user]);

  // Complete OAuth if redirected back here with ?code=…
  const oauthHandledRef = useRef<string | null>(null);
  useEffect(() => {
    const code = params.get("code");
    const state = params.get("state");
    if (!code || !user) return;
    if (oauthHandledRef.current === code) return;
    oauthHandledRef.current = code;
    params.delete("code");
    params.delete("scope");
    params.delete("state");
    setParams(params, { replace: true });
    (async () => {
      try {
        const r = await completeGoogleContactsConnect(code, state);
        setGoogleEmail(r.email);
        setGoogleOpen(true);
        toast({ title: "Google connected", description: "Account linked." });
        setSyncing(true);
        const { contacts: list, warning } = await syncGoogleContacts();
        toast({
          title: list.length === 0 ? (warning || "No contacts found") : "Contacts synced",
          description:
            list.length === 0
              ? "This Google account has no saved contacts with phone numbers."
              : `${list.length} contacts loaded.`,
        });
      } catch (e) {
        if (e instanceof GoogleContactsReconnectRequired) setGoogleEmail(null);
        toast({
          title: "Google connect failed",
          description: friendlyError(e),
          variant: "destructive",
        });
      } finally {
        setSyncing(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const connectGoogle = async () => {
    setConnecting(true);
    try {
      await startGoogleContactsConnect();
    } catch (e) {
      setConnecting(false);
      toast({
        title: "Could not start Google sign-in",
        description: friendlyError(e),
        variant: "destructive",
      });
    }
  };

  const syncGoogleNow = async () => {
    setSyncing(true);
    try {
      const { contacts: list, warning } = await syncGoogleContacts();
      toast({
        title: list.length === 0 ? (warning || "No contacts found") : "Contacts synced",
        description:
          list.length === 0
            ? "This Google account has no saved contacts with phone numbers."
            : `${list.length} contacts loaded.`,
      });
    } catch (e) {
      if (e instanceof GoogleContactsReconnectRequired) setGoogleEmail(null);
      toast({
        title: "Sync failed",
        description: friendlyError(e),
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const toggleVoiceTranscribe = (v: boolean) => {
    setVoiceTranscribe(v);
    setVoiceTranscribeEnabled(v);
  };

  const chooseLang = (code: string) => {
    setPreferredLang(code);
    setPreferredLanguage(code);
    setLangOpen(false);
    toast({ title: "Language updated" });
  };

  const stopPreview = () => {
    stopRef.current?.();
    stopRef.current = null;
    setPreviewing(null);
  };

  const togglePreview = (id: RingtoneId) => {
    if (previewing === id) {
      stopPreview();
      return;
    }
    stopPreview();
    setPreviewing(id);
    stopRef.current = playRingtone(id, 8);
  };

  const choose = (id: RingtoneId) => {
    setSelected(id);
    setSelectedRingtone(id);
    toast({ title: "Ringtone updated" });
  };

  const onPickFile = async (file: File) => {
    if (!file.type.startsWith("audio/")) {
      toast({ title: "Please choose an audio file", variant: "destructive" });
      return;
    }
    if (file.size > MAX_CUSTOM_BYTES) {
      toast({
        title: "File too large",
        description: "Please pick an audio file under 3 MB.",
        variant: "destructive",
      });
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const c = { name: file.name, dataUrl };
    setCustomRingtone(c);
    setCustom(c);
    choose("custom:user");
  };

  const removeCustom = () => {
    setCustomRingtone(null);
    setCustom(null);
    if (selected === "custom:user") {
      setSelected("melody-marimba");
      setSelectedRingtone("melody-marimba");
    }
  };

  const themeLabel =
    theme === "dark" ? "Dark" : theme === "light" ? "Light" : "System default";
  const toneLabel =
    selected === "custom:user"
      ? custom?.name ?? "From my music"
      : RINGTONES.find((r) => r.id === selected)?.label ?? "Default";

  const grouped = {
    Melody: RINGTONES.filter((r) => r.category === "Melody"),
    Classic: RINGTONES.filter((r) => r.category === "Classic"),
    Modern: RINGTONES.filter((r) => r.category === "Modern"),
    Playful: RINGTONES.filter((r) => r.category === "Playful"),
  };

  return (
    <MobileFrame>
      <div className="h-full w-full flex flex-col bg-background overflow-y-auto">
        {/* Header */}
        <div className="px-2 pt-4 pb-3 flex items-center gap-2 border-b border-border sticky top-0 bg-background z-10">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <h1 className="text-sm font-semibold text-foreground">Phone settings</h1>
        </div>

        <div className="flex-1 px-3 py-4">
          {/* Theme */}
          <button
            onClick={() => setThemeOpen(true)}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-secondary text-left"
          >
            <span className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
              <Palette className="w-4 h-4 text-primary" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground">Theme</p>
              <p className="text-xs text-muted-foreground">{themeLabel}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>

          {/* Ringtone */}
          <button
            onClick={() => setToneOpen(true)}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-secondary text-left"
          >
            <span className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
              <Music className="w-4 h-4 text-primary" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground">Ringtone</p>
              <p className="text-xs text-muted-foreground truncate">
                {toneLabel} · plays on incoming calls
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>

          {/* Google contacts — collapsible. Connect when not linked, sync when linked. */}
          <button
            onClick={() => setGoogleOpen((v) => !v)}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-secondary text-left"
          >
            <span className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
              <Contact2 className="w-4 h-4 text-primary" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground">Google contact</p>
              <p className="text-xs text-muted-foreground truncate">
                {googleEmail ? `Connected · ${googleEmail}` : "Not connected"}
              </p>
            </div>
            <ChevronRight
              className={`w-4 h-4 text-muted-foreground transition-transform ${googleOpen ? "rotate-90" : ""}`}
            />
          </button>
          {googleOpen && (
            <div className="px-3 pb-3 -mt-1">
              {googleEmail ? (
                <button
                  onClick={syncGoogleNow}
                  disabled={syncing}
                  className="w-full h-10 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-60 inline-flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
                  {syncing ? "Syncing…" : "Sync now"}
                </button>
              ) : (
                <button
                  onClick={connectGoogle}
                  disabled={connecting}
                  className="w-full h-10 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-60 inline-flex items-center justify-center gap-1.5"
                >
                  {connecting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {connecting ? "Opening Google…" : "Connect account"}
                </button>
              )}
            </div>
          )}

          {/* Voice note transcription — a "Transcribe" option on voice notes
              (sent or received) in chat. Off by default it'd never get
              discovered, so this defaults on with an easy opt-out here. */}
          <div className="w-full flex items-center gap-3 px-3 py-3 rounded-lg">
            <span className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
              <Type className="w-4 h-4 text-primary" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground">Voice note transcription</p>
              <p className="text-xs text-muted-foreground truncate">
                Show a "Transcribe" option on voice notes
              </p>
            </div>
            <Switch checked={voiceTranscribe} onCheckedChange={toggleVoiceTranscribe} />
          </div>

          {/* Language a translated voice-note transcript comes back in. */}
          <button
            onClick={() => setLangOpen(true)}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-secondary text-left"
          >
            <span className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
              <Globe className="w-4 h-4 text-primary" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground">Preferred language</p>
              <p className="text-xs text-muted-foreground truncate">
                Voice note transcripts translate into {languageLabel(preferredLang)}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Theme dialog */}
        <Dialog open={themeOpen} onOpenChange={setThemeOpen}>
          <DialogContent className="max-w-[300px] bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-sm">Choose theme</DialogTitle>
            </DialogHeader>
            <div className="space-y-1">
              {[
                { value: "system", label: "System default", Icon: Monitor },
                { value: "dark", label: "Dark", Icon: Moon },
                { value: "light", label: "Light", Icon: Sun },
              ].map(({ value, label, Icon }) => (
                <button
                  key={value}
                  onClick={() => {
                    setTheme(value);
                    setThemeOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left text-xs ${
                    theme === value
                      ? "bg-primary/15 text-foreground"
                      : "hover:bg-secondary text-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4 text-primary" />
                  <span className="flex-1">{label}</span>
                  {theme === value && (
                    <Check className="w-4 h-4 text-primary" />
                  )}
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* Language dialog */}
        <Dialog open={langOpen} onOpenChange={setLangOpen}>
          <DialogContent className="max-w-[300px] bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-sm">Preferred language</DialogTitle>
            </DialogHeader>
            <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-1">
              {LANGUAGES.map(({ code, label }) => (
                <button
                  key={code}
                  onClick={() => chooseLang(code)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left text-xs ${
                    preferredLang === code
                      ? "bg-primary/15 text-foreground"
                      : "hover:bg-secondary text-foreground"
                  }`}
                >
                  <span className="flex-1">{label}</span>
                  {preferredLang === code && (
                    <Check className="w-4 h-4 text-primary" />
                  )}
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* Ringtone dialog */}
        <Dialog open={toneOpen} onOpenChange={setToneOpen}>
          <DialogContent className="max-w-[340px] bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-sm">Choose ringtone</DialogTitle>
            </DialogHeader>

            <input
              ref={fileRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPickFile(f);
                e.target.value = "";
              }}
            />

            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {/* From device */}
              <div>
                <p className="text-2xs uppercase tracking-wider text-muted-foreground px-1 mb-1">
                  From my music
                </p>
                <div className="space-y-1">
                  {custom && (
                    <RingtoneRow
                      label={custom.name}
                      description="Custom audio"
                      isSelected={selected === "custom:user"}
                      isPlaying={previewing === "custom:user"}
                      onPreview={() => togglePreview("custom:user")}
                      onSelect={() => choose("custom:user")}
                      trailing={
                        <button
                          onClick={removeCustom}
                          aria-label="Remove custom ringtone"
                          className="w-6 h-6 rounded-full hover:bg-destructive/20 flex items-center justify-center shrink-0"
                        >
                          <X className="w-3.5 h-3.5 text-destructive" />
                        </button>
                      }
                    />
                  )}
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md hover:bg-secondary text-left"
                  >
                    <span className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                      <Upload className="w-3.5 h-3.5 text-primary" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground">
                        {custom ? "Replace audio…" : "Pick audio from device…"}
                      </p>
                      <p className="text-2xs text-muted-foreground">
                        Any audio file under 3 MB
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {(Object.keys(grouped) as Array<keyof typeof grouped>).map((cat) => (
                <div key={cat}>
                  <p className="text-2xs uppercase tracking-wider text-muted-foreground px-1 mb-1">
                    {cat}
                  </p>
                  <div className="space-y-1">
                    {grouped[cat].map((r) => (
                      <RingtoneRow
                        key={r.id}
                        label={r.label}
                        description={r.description}
                        isSelected={selected === r.id}
                        isPlaying={previewing === r.id}
                        onPreview={() => togglePreview(r.id)}
                        onSelect={() => choose(r.id)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-2xs text-muted-foreground px-1 pt-1">
              Tap ▶ to preview, tap the name to select. ✓ marks the active ringtone.
            </p>
          </DialogContent>
        </Dialog>
      </div>
    </MobileFrame>
  );
}

function RingtoneRow({
  label,
  description,
  isSelected,
  isPlaying,
  onPreview,
  onSelect,
  trailing,
}: {
  label: string;
  description: string;
  isSelected: boolean;
  isPlaying: boolean;
  onPreview: () => void;
  onSelect: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <div
      className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md ${
        isSelected ? "bg-primary/15 ring-1 ring-primary/40" : "hover:bg-secondary"
      }`}
    >
      <button
        onClick={onPreview}
        aria-label={isPlaying ? "Stop preview" : "Preview"}
        className="w-7 h-7 rounded-full bg-primary/20 hover:bg-primary/30 flex items-center justify-center shrink-0"
      >
        {isPlaying ? (
          <Square className="w-3 h-3 text-primary fill-primary" />
        ) : (
          <Play className="w-3 h-3 text-primary fill-primary ml-0.5" />
        )}
      </button>
      <button onClick={onSelect} className="flex-1 min-w-0 text-left">
        <p
          className={`text-xs font-medium truncate ${
            isSelected ? "text-primary" : "text-foreground"
          }`}
        >
          {label}
        </p>
        <p className="text-2xs text-muted-foreground truncate">{description}</p>
      </button>
      {isSelected && (
        <span className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
          <Check className="w-3 h-3 text-primary-foreground" strokeWidth={3} />
        </span>
      )}
      {trailing}
    </div>
  );
}

/** Strip technical noise (URLs, UUIDs) from error messages before showing them. */
function friendlyError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? "");
  return (
    raw
      .replace(/https?:\/\/\S+/gi, "")
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim() || "Please try again."
  );
}
