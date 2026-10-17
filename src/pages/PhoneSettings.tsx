import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight, Loader2, Moon, Music, Play, Square, Upload, X } from "lucide-react";
import { useTheme } from "next-themes";
import MobileFrame from "@/components/MobileFrame";
import { ArrowLeft } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import {
  RINGTONES,
  RingtoneId,
  DEFAULT_RINGTONE,
  MAX_CUSTOM_RINGTONE_BYTES,
  getSelectedRingtone,
  setSelectedRingtone,
  playRingtone,
  getCustomRingtone,
  saveCustomRingtone,
  removeCustomRingtone,
  hasCustomRingtoneFile,
  CustomRingtone,
} from "@/lib/ringtones";
import { useBackNavigation } from "@/hooks/useBackNavigation";
import { syncNativeRingtone } from "@/lib/nativeRingtone";

/** "4.2 MB", "820 KB". */
function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** "MP3", "M4A", "WAV" from the file name, else from its type. */
function formatOf(c: CustomRingtone): string {
  const ext = c.name.includes(".") ? c.name.split(".").pop() : "";
  if (ext && ext.length <= 5) return ext.toUpperCase();
  const sub = c.type.split("/")[1] ?? "";
  return (sub.replace(/^x-/, "") || "Audio").toUpperCase();
}

export default function PhoneSettings() {
  const { showBackArrow, goBack } = useBackNavigation("/settings");
  const { resolvedTheme, setTheme } = useTheme();
  const [toneOpen, setToneOpen] = useState(false);
  const [selected, setSelected] = useState<RingtoneId>(getSelectedRingtone());
  const [custom, setCustom] = useState<CustomRingtone | null>(getCustomRingtone());
  // False when the saved audio is no longer on this device.
  const [customAvailable, setCustomAvailable] = useState(true);
  const [savingTone, setSavingTone] = useState(false);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    document.title = "Phone settings — Chichat";
  }, []);

  useEffect(() => {
    if (!toneOpen) stopPreview();
  }, [toneOpen]);

  useEffect(() => {
    return () => stopPreview();
  }, []);

  useEffect(() => {
    if (!custom) return;
    let cancelled = false;
    void hasCustomRingtoneFile().then((ok) => {
      if (!cancelled) setCustomAvailable(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [custom]);

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
    // The phone app rings with the same tone when ChiChat is closed.
    void syncNativeRingtone();
    toast({ title: "Ringtone updated" });
  };

  const onPickFile = async (file: File) => {
    if (!file.type.startsWith("audio/")) {
      toast({ title: "Please choose an audio file", variant: "destructive" });
      return;
    }
    if (file.size > MAX_CUSTOM_RINGTONE_BYTES) {
      toast({
        title: "File too large",
        description: "Please pick an audio file under 50 MB.",
        variant: "destructive",
      });
      return;
    }
    setSavingTone(true);
    try {
      const c = await saveCustomRingtone(file);
      setCustom(c);
      setCustomAvailable(true);
      choose("custom:user");
    } catch {
      toast({ title: "Couldn't use that file", description: "Please try another audio file.", variant: "destructive" });
    } finally {
      setSavingTone(false);
    }
  };

  const removeCustom = async () => {
    stopPreview();
    await removeCustomRingtone();
    setCustom(null);
    if (selected === "custom:user") {
      setSelected(DEFAULT_RINGTONE);
      setSelectedRingtone(DEFAULT_RINGTONE);
      void syncNativeRingtone();
    }
  };

  const isDark = resolvedTheme === "dark";
  const customMissing = selected === "custom:user" && custom !== null && !customAvailable;
  const toneLabel =
    selected === "custom:user" && custom
      ? custom.name
      : RINGTONES.find((r) => r.id === selected)?.label ?? "Default";
  const toneDetails =
    selected === "custom:user" && custom
      ? customMissing
        ? "File no longer on this phone · choose another"
        : `${formatSize(custom.size)} · ${formatOf(custom)}`
      : RINGTONES.find((r) => r.id === selected)?.description ?? "";

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
          {showBackArrow && (
            <button
              onClick={goBack}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
          )}
          <h1 className={`text-sm font-semibold text-foreground ${showBackArrow ? "" : "pl-2"}`}>Phone settings</h1>
        </div>

        <div className="flex-1 px-3 py-4">
          {/* Theme: dark mode on or off */}
          <div className="w-full flex items-center gap-3 px-3 py-3 rounded-lg">
            <span className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
              <Moon className="w-4 h-4 text-primary" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground">Dark mode</p>
            </div>
            <Switch
              checked={isDark}
              onCheckedChange={(on) => setTheme(on ? "dark" : "light")}
              aria-label="Dark mode"
            />
          </div>

          {/* Ringtone: the chosen tone, with its details and a preview */}
          <div className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-secondary">
            <button
              onClick={() => togglePreview(selected)}
              disabled={customMissing}
              aria-label={previewing === selected ? "Stop preview" : "Preview ringtone"}
              className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0 disabled:opacity-50"
            >
              {previewing === selected ? (
                <Square className="w-3.5 h-3.5 text-primary fill-primary" />
              ) : (
                <Music className="w-4 h-4 text-primary" />
              )}
            </button>
            <button onClick={() => setToneOpen(true)} className="flex-1 min-w-0 flex items-center gap-3 text-left">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground">Ringtone</p>
                <p className="text-xs text-foreground truncate">{toneLabel}</p>
                <p className={`text-2xs truncate ${customMissing ? "text-destructive" : "text-muted-foreground"}`}>
                  {toneDetails}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

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
                      description={customAvailable ? `${formatSize(custom.size)} · ${formatOf(custom)}` : "File no longer on this phone"}
                      isSelected={selected === "custom:user"}
                      isPlaying={previewing === "custom:user"}
                      onPreview={() => togglePreview("custom:user")}
                      onSelect={() => choose("custom:user")}
                      trailing={
                        <button
                          onClick={() => void removeCustom()}
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
                    disabled={savingTone}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md hover:bg-secondary text-left disabled:opacity-60"
                  >
                    <span className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                      {savingTone ? (
                        <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                      ) : (
                        <Upload className="w-3.5 h-3.5 text-primary" />
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground">
                        {custom ? "Replace audio…" : "Pick audio from device…"}
                      </p>
                      <p className="text-2xs text-muted-foreground">
                        Any audio file up to 50 MB
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
