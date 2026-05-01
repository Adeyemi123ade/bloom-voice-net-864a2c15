import { useMemo, useRef, useState } from "react";
import { Phone, Delete, Search, UserPlus } from "lucide-react";
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
import BottomNav from "@/components/BottomNav";

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

/** Per-letter avatar tint inspired by reference screen. */
const AVATAR_TINTS = [
  { bg: "bg-emerald-500/15", border: "border-emerald-400/40", text: "text-emerald-400" },
  { bg: "bg-amber-500/15",   border: "border-amber-400/40",   text: "text-amber-400" },
  { bg: "bg-sky-500/15",     border: "border-sky-400/40",     text: "text-sky-400" },
  { bg: "bg-fuchsia-500/15", border: "border-fuchsia-400/40", text: "text-fuchsia-400" },
  { bg: "bg-rose-500/15",    border: "border-rose-400/40",    text: "text-rose-400" },
  { bg: "bg-indigo-500/15",  border: "border-indigo-400/40",  text: "text-indigo-400" },
];

function tintFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length];
}

function initialOf(name: string) {
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
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Load contacts once per open
  const allContacts = useMemo<DeviceContact[]>(() => {
    if (!open) return [];
    const merged = [...(loadCachedContacts() ?? []), ...loadManualContacts()];
    const seen = new Set<string>();
    return merged.filter((c) => {
      const key = `${c.name}|${c.phones[0] ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [open]);

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = search.replace(/[^\d]/g, "");
    if (!q) return [...allContacts].sort((a, b) => a.name.localeCompare(b.name));
    return allContacts.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
      if (digits && c.phones.some((p) => p.replace(/[^\d]/g, "").includes(digits))) return true;
      return false;
    });
  }, [allContacts, search]);

  const e164Preview = value ? toE164(value) : null;

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[420px] w-full h-[100dvh] sm:h-[92vh] p-0 gap-0 bg-background top-0 left-1/2 -translate-x-1/2 translate-y-0 rounded-none sm:rounded-2xl border-0 shadow-2xl flex flex-col overflow-hidden pb-[88px] [&>button.absolute]:hidden"
      >
        <DialogTitle className="sr-only">Call</DialogTitle>

        {/* Header — Add Contact action; navigation handled by bottom nav. */}
        <header className="px-4 pt-4 pb-2 flex items-center justify-end shrink-0">
          <button
            type="button"
            aria-label="Add contact"
            onClick={() => {
              const prefill = value ? toE164(value) : null;
              onOpenChange(false);
              navigate(prefill ? `/contacts/new?phone=${encodeURIComponent(prefill)}` : "/contacts/new");
            }}
            className="h-10 px-3 rounded-full hover:bg-secondary flex items-center gap-2 text-sm font-medium text-foreground"
          >
            <UserPlus className="w-5 h-5" />
            Add contact
          </button>
        </header>

        {/* Search */}
        <div className="px-5 pb-3 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search contacts..."
              className="w-full h-12 pl-11 pr-4 rounded-2xl bg-secondary/40 border border-border/30 text-sm placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary/40"
            />
          </div>
        </div>

        {/* Contact list — guaranteed room for at least 3 rows above the keypad. */}
        <div className="px-5 pb-3 flex-1 min-h-[228px] overflow-y-auto space-y-2">
          {filteredContacts.length === 0 ? (
            <p className="text-xs text-muted-foreground/70 italic py-6 text-center">
              {search ? "No matching contact" : "Your contacts will appear here"}
            </p>
          ) : (
            filteredContacts.map((c) => {
              const tint = tintFor(c.name);
              return (
                <div
                  key={`${c.name}-${c.phones[0]}`}
                  className="flex items-center gap-3 p-2 rounded-2xl bg-secondary/50"
                >
                  <span
                    className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 text-base font-bold overflow-hidden ${tint.bg} ${tint.border} ${tint.text}`}
                  >
                    {c.avatar ? (
                      <img src={c.avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      initialOf(c.name)
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {formatDisplay(c.phones[0]) || c.phones[0]}
                    </p>
                  </div>
                  <button
                    onClick={() => placeCall(c.phones[0])}
                    aria-label={`Call ${c.name}`}
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors"
                    style={{ backgroundColor: "#0B5D3B", color: "#FFFFFF" }}
                  >
                    <Phone className="w-4 h-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Compact keypad panel — sits low so it's easy to reach with the thumb. */}
        <div className="mx-2 mb-2 rounded-2xl bg-secondary/30 border border-border/40 p-3 shrink-0">
          {/* Number display */}
          <div className="relative mb-2">
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
              placeholder="Enter number"
              className="w-full h-9 text-xl font-light tracking-wide text-center bg-transparent border-0 focus:outline-none placeholder:text-muted-foreground/60"
            />
            <button
              aria-label="Backspace"
              onClick={backspace}
              disabled={!value}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full hover:bg-secondary flex items-center justify-center disabled:opacity-30"
            >
              <Delete className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* Live formatted preview */}
          <div className="h-3 mb-1.5 text-[10px] text-muted-foreground text-center truncate">
            {e164Preview && formatDisplay(e164Preview) !== value
              ? formatDisplay(e164Preview)
              : "\u00A0"}
          </div>

          {/* Keypad grid — high-contrast keys readable in both light and dark. */}
          <div className="grid grid-cols-3 gap-1.5">
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
                className="h-11 rounded-xl flex flex-col items-center justify-center transition-colors"
                style={{ backgroundColor: "#0B5D3B", color: "#FFFFFF" }}
              >
                <span className="text-lg font-semibold leading-none" style={{ color: "#FFFFFF" }}>
                  {k.d}
                </span>
                {k.sub && (
                  <span className="text-[8px] tracking-[0.2em] leading-none mt-0.5" style={{ color: "#FFFFFF", opacity: 0.85 }}>
                    {k.sub}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Full-width Call button — easy thumb target at the bottom. */}
          <button
            onClick={callTyped}
            disabled={!value}
            aria-label="Call"
            className="mt-2 w-full h-12 rounded-xl bg-primary hover:bg-primary/90 active:bg-primary/95 text-primary-foreground flex items-center justify-center gap-2 shadow-md disabled:opacity-40 transition-colors"
          >
            <Phone className="w-5 h-5" />
            <span className="text-sm font-semibold">Call</span>
          </button>
        </div>

        {/* Bottom nav inside dialer — closes overlay on tap, then routes. */}
        <BottomNav active="calls" onBeforeNavigate={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
