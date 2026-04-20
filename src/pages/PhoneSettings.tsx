import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronRight, Music, Palette, Play, Square, Upload, X } from "lucide-react";
import { useTheme } from "next-themes";
import MobileFrame from "@/components/MobileFrame";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Monitor, Moon, Sun } from "lucide-react";
import { toast } from "@/hooks/use-toast";
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
  const { theme, setTheme } = useTheme();
  const [themeOpen, setThemeOpen] = useState(false);
  const [toneOpen, setToneOpen] = useState(false);
  const [selected, setSelected] = useState<RingtoneId>(getSelectedRingtone());
  const [custom, setCustom] = useState<CustomRingtone | null>(getCustomRingtone());
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
        <div className="px-3 pt-4 pb-3 border-b border-border sticky top-0 bg-background z-10">
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
              <p className="text-[11px] text-muted-foreground">{themeLabel}</p>
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
              <p className="text-[11px] text-muted-foreground truncate">
                {toneLabel} · plays on incoming calls
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
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-1 mb-1">
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
                      <p className="text-[10px] text-muted-foreground">
                        Any audio file under 3 MB
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {(Object.keys(grouped) as Array<keyof typeof grouped>).map((cat) => (
                <div key={cat}>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-1 mb-1">
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
            <p className="text-[10px] text-muted-foreground px-1 pt-1">
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
        <p className="text-[10px] text-muted-foreground truncate">{description}</p>
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
