import { useMemo, useRef, useState } from "react";
import { Phone, X, UserPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { toE164, formatDisplay } from "@/lib/phone";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import {
  loadCachedContacts,
  loadManualContacts,
  type DeviceContact,
} from "@/lib/deviceContacts";
import AddNumberDialog from "@/components/AddNumberDialog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Optional initial value (e.g. when re-dialing). */
  initial?: string;
}

const KEYS: { d: string; sub?: string }[] = [
  { d: "1" }, { d: "2", sub: "ABC" }, { d: "3", sub: "DEF" },
  { d: "4", sub: "GHI" }, { d: "5", sub: "JKL" }, { d: "6", sub: "MNO" },
  { d: "7", sub: "PQRS" }, { d: "8", sub: "TUV" }, { d: "9", sub: "WXYZ" },
  { d: "*" }, { d: "0", sub: "+" }, { d: "#" },
];

function initial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

/** Tone-on-tap for digit keys (cheap WebAudio beep). */
function playKeyTone() {
  try {
    const AC =
      (window as unknown as { AudioContext?: typeof AudioContext })
        .AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 600;
    g.gain.value = 0.04;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    setTimeout(() => {
      o.stop();
      ctx.close();
    }, 60);
  } catch {
    /* ignore */
  }
}

export default function Dialpad({ open, onOpenChange, initial: init = "" }: Props) {
  const [value, setValue] = useState(init);
  const [askAdd, setAskAdd] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Load contacts once per open
  const allContacts = useMemo<DeviceContact[]>(() => {
    if (!open) return [];
    return [...(loadCachedContacts() ?? []), ...loadManualContacts()];
  }, [open]);

  // Suggested = contacts whose name OR any phone digit-substring matches what's typed.
  // When nothing typed, show first 6 contacts (alphabetical).
  const suggested = useMemo(() => {
    const q = value.replace(/[^\d]/g, "");
    if (!q) {
      return [...allContacts]
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 6);
    }
    const matches: { c: DeviceContact; phone: string }[] = [];
    for (const c of allContacts) {
      for (const p of c.phones) {
        if (p.replace(/[^\d]/g, "").includes(q)) {
          matches.push({ c, phone: p });
          break;
        }
      }
      if (matches.length >= 8) break;
    }
    if (matches.length === 0) {
      // fall back to name match
      const lower = value.toLowerCase();
      return allContacts
        .filter((c) => c.name.toLowerCase().includes(lower))
        .slice(0, 6);
    }
    return matches.map((m) => ({ ...m.c, phones: [m.phone, ...m.c.phones.filter((p) => p !== m.phone)] }));
  }, [allContacts, value]);

  const e164Preview = value ? toE164(value) : null;
  const isKnown = useMemo(() => {
    if (!e164Preview) return false;
    return allContacts.some((c) => c.phones.includes(e164Preview));
  }, [allContacts, e164Preview]);

  /** Insert a string at the current cursor position (or append). */
  const insertAtCursor = (chunk: string) => {
    const el = inputRef.current;
    if (!el) {
      setValue((v) => v + chunk);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + chunk + value.slice(end);
    setValue(next);
    requestAnimationFrame(() => {
      const pos = start + chunk.length;
      el.focus();
      try {
        el.setSelectionRange(pos, pos);
      } catch { /* ignore */ }
    });
  };

  const backspace = () => {
    const el = inputRef.current;
    if (!el) {
      setValue((v) => v.slice(0, -1));
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    if (start !== end) {
      const next = value.slice(0, start) + value.slice(end);
      setValue(next);
      requestAnimationFrame(() => {
        el.focus();
        try { el.setSelectionRange(start, start); } catch { /* ignore */ }
      });
      return;
    }
    if (start === 0) return;
    const next = value.slice(0, start - 1) + value.slice(start);
    setValue(next);
    requestAnimationFrame(() => {
      el.focus();
      try { el.setSelectionRange(start - 1, start - 1); } catch { /* ignore */ }
    });
  };

  const press = (k: string) => {
    playKeyTone();
    insertAtCursor(k);
  };

  const longZero = () => {
    const el = inputRef.current;
    const caret = el?.selectionStart ?? value.length;
    if (caret > 0 && value[caret - 1] === "0") {
      const next = value.slice(0, caret - 1) + "+" + value.slice(caret);
      setValue(next);
      requestAnimationFrame(() => {
        el?.focus();
        try { el?.setSelectionRange(caret, caret); } catch { /* ignore */ }
      });
    } else {
      insertAtCursor("+");
    }
  };

  const placeCall = (raw: string) => {
    const e164 = toE164(raw.trim());
    if (!e164) {
      toast({
        title: "Invalid number",
        description: "Use international format like +234 801 234 5678.",
        variant: "destructive",
      });
      return;
    }
    onOpenChange(false);
    navigate(`/dial/${encodeURIComponent(e164)}`);
  };

  const callTyped = () => placeCall(value);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-w-[400px] p-0 gap-0 bg-background top-auto bottom-0 translate-y-0 rounded-b-none rounded-t-2xl border-0 shadow-2xl max-h-[92vh] flex flex-col"
        >
          <DialogTitle className="sr-only">Dialer</DialogTitle>

          {/* Suggested contacts */}
          <div className="px-4 pt-3 pb-2 overflow-y-auto" style={{ maxHeight: "30vh" }}>
            <p className="text-[11px] font-medium text-muted-foreground mb-2">
              Suggested
            </p>
            {suggested.length === 0 ? (
              <p className="text-[10px] text-muted-foreground/70 italic py-2">
                {value ? "No matching contact" : "Your contacts will appear here"}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {suggested.map((c) => (
                  <li key={`${c.name}-${c.phones[0]}`}>
                    <button
                      onClick={() => placeCall(c.phones[0])}
                      className="w-full flex items-center gap-3 p-2 rounded-xl bg-secondary/40 hover:bg-secondary text-left"
                    >
                      <span className="w-9 h-9 rounded-full bg-accent/30 text-accent-foreground text-xs font-semibold flex items-center justify-center shrink-0">
                        {initial(c.name)}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs font-semibold truncate">
                          {c.name}
                        </span>
                        <span className="block text-[10px] text-muted-foreground truncate">
                          {formatDisplay(c.phones[0])}
                        </span>
                      </span>
                      <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Number display + clear / add affordances */}
          <div className="px-4 pt-2 pb-1 flex items-center gap-2 border-t border-border/40">
            <input
              ref={inputRef}
              type="tel"
              inputMode="tel"
              autoComplete="off"
              value={value}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/[^\d+*#]/g, "");
                setValue(cleaned);
              }}
              placeholder=" "
              className="flex-1 h-12 text-2xl font-light tracking-wide text-center bg-transparent border-0 focus:outline-none px-1"
            />
            {value && (
              <button
                aria-label="Backspace"
                onClick={backspace}
                className="w-9 h-9 rounded-full hover:bg-secondary flex items-center justify-center shrink-0"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Add to contacts row — only when typed number is valid AND unknown */}
          {e164Preview && !isKnown && (
            <div className="px-4 pb-1 flex items-center justify-center">
              <button
                onClick={() => setAskAdd(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/60 hover:bg-secondary text-[11px] font-medium"
              >
                <UserPlus className="w-3.5 h-3.5 text-primary" />
                Add to contacts
              </button>
            </div>
          )}

          {/* Live formatted preview */}
          <div className="px-4 pb-1 h-4 text-[10px] text-muted-foreground text-center truncate">
            {e164Preview && formatDisplay(e164Preview) !== value
              ? formatDisplay(e164Preview)
              : "\u00A0"}
          </div>

          {/* Keypad */}
          <div className="px-4 pb-2 grid grid-cols-3 gap-x-3 gap-y-2">
            {KEYS.map((k) => (
              <button
                key={k.d}
                onClick={() => press(k.d)}
                onContextMenu={(e) => {
                  if (k.d === "0") {
                    e.preventDefault();
                    longZero();
                  }
                }}
                className="h-12 rounded-full bg-secondary/60 hover:bg-secondary active:bg-primary/20 flex flex-col items-center justify-center transition-colors"
              >
                <span className="text-xl font-medium text-foreground leading-none">
                  {k.d}
                </span>
                {k.sub && (
                  <span className="text-[8px] text-muted-foreground tracking-[0.15em] leading-none mt-0.5">
                    {k.sub}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Big green Call pill */}
          <div className="px-4 pb-5 pt-1 flex items-center justify-center">
            <button
              onClick={callTyped}
              disabled={!value}
              aria-label="Call"
              className="h-14 px-8 min-w-[140px] rounded-full bg-primary hover:bg-primary/90 active:bg-primary/95 text-primary-foreground flex items-center justify-center gap-2 shadow-lg disabled:opacity-40 transition-colors"
            >
              <Phone className="w-5 h-5" />
              <span className="text-sm font-semibold">Call</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {e164Preview && (
        <AddNumberDialog
          open={askAdd}
          onOpenChange={setAskAdd}
          phoneE164={e164Preview}
        />
      )}
    </>
  );
}
