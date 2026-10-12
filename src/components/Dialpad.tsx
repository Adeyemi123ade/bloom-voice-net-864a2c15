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
  // On touch screens the on-screen dial pad is the only way to enter a
  // number. inputMode="none" alone is not honoured by every Android
  // keyboard: focusing the field (which every key press used to do, to keep
  // the cursor position) popped the phone's own keyboard up over the dial
  // pad. So on touch devices the field is read-only, never focused, and keys
  // append at the end like a phone dialer. Mouse/keyboard devices keep the
  // editable field with cursor editing and typing.
  const touchOnly = useMemo(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches,
    [],
  );

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
    if (!el || touchOnly) {
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
    if (!el || touchOnly) {
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
    if (touchOnly) {
      setValue((v) => (v.endsWith("0") ? v.slice(0, -1) + "+" : v + "+"));
      return;
    }
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
          className="max-w-[420px] w-full top-0 bottom-0 h-auto max-h-none sm:bottom-auto sm:h-[92vh] sm:max-h-[85vh] p-0 gap-0 bg-background left-1/2 -translate-x-1/2 translate-y-0 rounded-none sm:rounded-2xl border-0 shadow-2xl flex flex-col overflow-hidden pb-[calc(96px+env(safe-area-inset-bottom))] [&>button.absolute]:hidden"
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

        {/*
          Search + contact list + keypad panel share one scroll region.
          Previously the contact list had its own capped height while the
          keypad panel was pinned with mt-auto inside an overflow-hidden
          dialog — on a short viewport (or with several contacts) the
          combined content could exceed the available height with no way
          to reach the bottom keypad rows. Wrapping them together in a
          single flex-1 + min-h-0 + overflow-y-auto container means the
          keypad always renders at full size and, if there isn't enough
          room, the whole region scrolls to reach it instead of clipping it.
        */}
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
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

        {/* Contact list — capped height so the keypad below isn't pushed too
            far down when there are many contacts; the outer container above
            handles scrolling if the total content still exceeds the viewport. */}
        <div className="px-5 pb-2 max-h-[28vh] overflow-y-auto space-y-2 shrink-0">
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

        {/* Number display — own section above the keypad, real breathing
            room instead of everything crammed into one tight card. */}
        <div className="mx-4 mt-3 mb-3 shrink-0">
          <div className="relative">
            <input
              ref={inputRef}
              type="tel"
              // Suppress the native mobile keyboard — the on-screen dialpad
              // is the ONLY input mechanism. Without inputMode="none" the
              // OS keyboard pops up on focus and the dialpad jumps around.
              inputMode="none"
              readOnly={touchOnly}
              autoComplete="off"
              value={value}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/[^\d+*#]/g, "");
                setValue(cleaned);
              }}
              placeholder="Enter number"
              className="w-full h-12 text-2xl font-light tracking-wide text-center bg-transparent border-0 focus:outline-none placeholder:text-muted-foreground/60"
            />
            <button
              aria-label="Backspace"
              onClick={backspace}
              disabled={!value}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full hover:bg-secondary flex items-center justify-center disabled:opacity-30"
            >
              <Delete className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* Live formatted preview */}
          <div className="h-4 text-xs text-muted-foreground text-center truncate">
            {e164Preview && formatDisplay(e164Preview) !== value
              ? formatDisplay(e164Preview)
              : "\u00A0"}
          </div>

        </div>

        {/* Keypad — its own dedicated card, comfortably sized keys. */}
        <div className="mx-4 mb-4 rounded-2xl bg-secondary/30 border border-border/40 p-4 shrink-0">
          <div className="grid grid-cols-3 gap-2.5">
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
                className="h-14 rounded-xl flex flex-col items-center justify-center transition-colors"
                style={{ backgroundColor: "#0B5D3B", color: "#FFFFFF" }}
              >
                <span className="text-xl font-semibold leading-none" style={{ color: "#FFFFFF" }}>
                  {k.d}
                </span>
                {k.sub && (
                  <span className="text-[9px] tracking-[0.2em] leading-none mt-1" style={{ color: "#FFFFFF" }}>
                    {k.sub}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Actions — own section below the keypad, never shares the
            keypad's container, so it can never sit visually on top of it. */}
        <div className="mx-4 mb-4 shrink-0 grid grid-cols-3 gap-2.5">
          <div />
          <button
            onClick={callTyped}
            disabled={!value}
            aria-label="Call"
            className="h-14 rounded-xl flex items-center justify-center disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
            style={{ backgroundColor: "#0B5D3B", color: "#FFFFFF" }}
          >
            <Phone className="w-6 h-6" />
          </button>
          <div />
        </div>
        </div>
        {/* end shared scroll region */}

        {/* Bottom nav inside dialer — closes overlay on tap, then routes. */}
        <BottomNav active="calls" onBeforeNavigate={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
