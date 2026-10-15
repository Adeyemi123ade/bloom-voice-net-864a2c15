import { useEffect, useMemo, useRef, useState } from "react";
import { Phone, Delete, Search, UserPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { toE164, formatDisplay } from "@/lib/phone";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { activeCallPath, getActiveCall } from "@/lib/activeCall";
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
  // Where the next digit goes. The number is drawn as separate characters
  // (not a text field), so tapping a digit moves this cursor there without
  // the phone's keyboard popping up over the dial pad; keys then insert and
  // backspace deletes at the cursor, so a wrong digit in the middle can be
  // fixed without clearing the number.
  const [caret, setCaret] = useState(init.length);
  const [search, setSearch] = useState("");
  const displayRef = useRef<HTMLDivElement>(null);
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

  const at = Math.min(caret, value.length);

  /** Insert at the cursor and move the cursor after the insert. */
  const insertAtCursor = (chunk: string) => {
    setValue(value.slice(0, at) + chunk + value.slice(at));
    setCaret(at + chunk.length);
  };

  /** Delete the digit just before the cursor (never the whole number). */
  const backspace = () => {
    if (at === 0) return;
    setValue(value.slice(0, at - 1) + value.slice(at));
    setCaret(at - 1);
  };

  const press = (k: string) => {
    playKeyTone();
    insertAtCursor(k);
  };

  // Hold 0 for "+": replaces the 0 that the press just typed.
  const longZero = () => {
    if (at > 0 && value[at - 1] === "0") {
      setValue(value.slice(0, at - 1) + "+" + value.slice(at));
    } else {
      insertAtCursor("+");
    }
  };

  /** Tap on a digit: cursor goes before or after it, whichever side was tapped. */
  const placeCaret = (index: number, e: React.MouseEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    setCaret(e.clientX < r.left + r.width / 2 ? index : index + 1);
  };

  // Keep the cursor in view on long numbers.
  useEffect(() => {
    displayRef.current?.querySelector("[data-caret]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [at, value]);

  // Physical keyboards (laptops): type digits, Backspace/Delete, arrows.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (/^[\d*#+]$/.test(e.key)) {
        e.preventDefault();
        insertAtCursor(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        backspace();
      } else if (e.key === "Delete") {
        e.preventDefault();
        if (at < value.length) setValue(value.slice(0, at) + value.slice(at + 1));
      } else if (e.key === "ArrowLeft") {
        setCaret(Math.max(0, at - 1));
      } else if (e.key === "ArrowRight") {
        setCaret(Math.min(value.length, at + 1));
      } else if (e.key === "Home") {
        setCaret(0);
      } else if (e.key === "End") {
        setCaret(value.length);
      } else if (e.key === "Enter" && value) {
        placeCall(value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const placeCall = (raw: string) => {
    // Already on a ChiChat call: go back to it instead of dialling out.
    const active = getActiveCall();
    if (active) {
      onOpenChange(false);
      navigate(activeCallPath(active));
      return;
    }
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
          className="max-w-[420px] w-full top-0 bottom-0 h-auto max-h-none sm:bottom-auto sm:h-[92vh] sm:max-h-[85vh] p-0 gap-0 bg-background left-1/2 -translate-x-1/2 translate-y-0 rounded-none sm:rounded-2xl border-0 shadow-2xl flex flex-col overflow-hidden pb-[calc(70px+env(safe-area-inset-bottom))] [&>button.absolute]:hidden"
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
        <div className="px-5 pb-2 flex-1 min-h-[88px] overflow-y-auto space-y-2">
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
                    style={{ backgroundColor: "hsl(var(--brand-deep))", color: "#FFFFFF" }}
                  >
                    <Phone className="w-4 h-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Number: tap a digit to put the cursor there. */}
        <div className="mx-4 mt-2 shrink-0">
          <div
            ref={displayRef}
            role="textbox"
            aria-label="Phone number"
            aria-readonly="true"
            data-testid="dial-number"
            onClick={() => setCaret(value.length)}
            className="h-12 px-2 flex items-center justify-center overflow-x-auto whitespace-nowrap text-[28px] font-light tracking-wide text-foreground cursor-text select-none [scrollbar-width:none]"
          >
            {value.length === 0 && <DialCaret />}
            {value.length === 0 && (
              <span className="text-muted-foreground/60 text-2xl">Enter number</span>
            )}
            {value.split("").map((ch, i) => (
              <span key={i} className="inline-flex items-center">
                {i === at && <DialCaret />}
                <span onClick={(e) => placeCaret(i, e)} className="px-[1px]">
                  {ch}
                </span>
              </span>
            ))}
            {value.length > 0 && at === value.length && <DialCaret />}
          </div>

          {/* Live formatted preview */}
          <div className="h-4 text-xs text-muted-foreground text-center truncate">
            {e164Preview && formatDisplay(e164Preview) !== value
              ? formatDisplay(e164Preview)
              : "\u00A0"}
          </div>
        </div>

        {/* Keypad, with Call and Backspace as its last row (same spacing as
            the digits, instead of a separate block further down). */}
        <div className="mx-4 mt-2 mb-2 rounded-2xl bg-secondary/30 border border-border/40 p-3 shrink-0">
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
                className="h-14 rounded-xl flex flex-col items-center justify-center transition-colors active:opacity-80"
                style={{ backgroundColor: "hsl(var(--brand-deep))", color: "#FFFFFF" }}
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
            <div />
            <button
              onClick={callTyped}
              disabled={!value}
              aria-label="Call"
              className="h-14 rounded-xl flex items-center justify-center disabled:cursor-not-allowed disabled:opacity-40 transition-colors bg-primary text-primary-foreground active:opacity-80"
            >
              <Phone className="w-6 h-6" />
            </button>
            <button
              aria-label="Backspace"
              onClick={backspace}
              disabled={at === 0}
              className="h-14 rounded-xl flex items-center justify-center text-foreground hover:bg-secondary active:bg-secondary disabled:opacity-30"
            >
              <Delete className="w-6 h-6" />
            </button>
          </div>
        </div>
        </div>
        {/* end shared scroll region */}

        {/* Bottom nav inside dialer — closes overlay on tap, then routes. */}
        <BottomNav active="calls" onBeforeNavigate={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

/** Blinking cursor in the dialled number. */
function DialCaret() {
  return (
    <span
      data-caret
      aria-hidden
      className="inline-block w-[2px] h-7 mx-[1px] bg-primary rounded-full animate-[dial-caret_1s_steps(1)_infinite]"
    />
  );
}
