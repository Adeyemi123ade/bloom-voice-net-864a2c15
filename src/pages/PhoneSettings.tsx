import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronRight, Music, Palette, Play, Square } from "lucide-react";
import { useTheme } from "next-themes";
import MobileFrame from "@/components/MobileFrame";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Monitor, Moon, Sun } from "lucide-react";
import {
  RINGTONES,
  RingtoneId,
  getSelectedRingtone,
  setSelectedRingtone,
  playRingtone,
} from "@/lib/ringtones";

export default function PhoneSettings() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [themeOpen, setThemeOpen] = useState(false);
  const [toneOpen, setToneOpen] = useState(false);
  const [selected, setSelected] = useState<RingtoneId>(getSelectedRingtone());
  const [previewing, setPreviewing] = useState<RingtoneId | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    document.title = "Phone settings — Chichat";
  }, []);

  // Stop preview when dialog closes or component unmounts
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
    // Auto-stop preview after one full cycle (~6s safe upper bound)
    stopRef.current = playRingtone(id, 6);
  };

  const choose = (id: RingtoneId) => {
    setSelected(id);
    setSelectedRingtone(id);
  };

  const themeLabel =
    theme === "dark" ? "Dark" : theme === "light" ? "Light" : "System default";
  const toneLabel = RINGTONES.find((r) => r.id === selected)?.label ?? "Default";

  const grouped = {
    Melody: RINGTONES.filter((r) => r.category === "Melody"),
    Classic: RINGTONES.filter((r) => r.category === "Classic"),
  };

  return (
    <MobileFrame>
      <div className="h-full w-full flex flex-col bg-background overflow-y-auto">
        {/* Header */}
        <div className="px-3 pt-4 pb-3 flex items-center gap-2 border-b border-border sticky top-0 bg-background z-10">
          <button
            aria-label="Back"
            onClick={() => navigate(-1)}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary"
          >
            <ArrowLeft className="w-4 h-4 text-foreground" />
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
              <p className="text-[11px] text-muted-foreground">
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
                    <span className="w-2 h-2 rounded-full bg-primary" />
                  )}
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* Ringtone dialog */}
        <Dialog open={toneOpen} onOpenChange={setToneOpen}>
          <DialogContent className="max-w-[320px] bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-sm">Choose ringtone</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {(Object.keys(grouped) as Array<keyof typeof grouped>).map((cat) => (
                <div key={cat}>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-1 mb-1">
                    {cat}
                  </p>
                  <div className="space-y-1">
                    {grouped[cat].map((r) => {
                      const isSelected = selected === r.id;
                      const isPlaying = previewing === r.id;
                      return (
                        <div
                          key={r.id}
                          className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md ${
                            isSelected ? "bg-primary/15" : "hover:bg-secondary"
                          }`}
                        >
                          <button
                            onClick={() => togglePreview(r.id)}
                            aria-label={isPlaying ? "Stop preview" : "Preview"}
                            className="w-7 h-7 rounded-full bg-primary/20 hover:bg-primary/30 flex items-center justify-center shrink-0"
                          >
                            {isPlaying ? (
                              <Square className="w-3 h-3 text-primary fill-primary" />
                            ) : (
                              <Play className="w-3 h-3 text-primary fill-primary ml-0.5" />
                            )}
                          </button>
                          <button
                            onClick={() => choose(r.id)}
                            className="flex-1 min-w-0 text-left"
                          >
                            <p className="text-xs font-medium text-foreground truncate">
                              {r.label}
                            </p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {r.description}
                            </p>
                          </button>
                          {isSelected && (
                            <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground px-1 pt-1">
              Tap ▶ to preview, tap the name to select.
            </p>
          </DialogContent>
        </Dialog>
      </div>
    </MobileFrame>
  );
}
